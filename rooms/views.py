from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db.models import Q
from .models import Room, RoomParticipant

@login_required
def dashboard_view(request):
    """Renders the main dashboard with optional search query support."""
    search_query = request.GET.get('q', '').strip()
    
    rooms = Room.objects.filter(is_active=True)
    if search_query:
        rooms = rooms.filter(
            Q(name__icontains=search_query) | 
            Q(room_id__icontains=search_query)
        )
    
    context = {
        'search_query': search_query,
        'rooms': rooms if search_query else None,
    }
    return render(request, 'dashboard.html', context)

@login_required
def create_room_view(request):
    """Creates a new room with a 9-digit room code and assigns the creator as host."""
    if request.method == 'POST':
        room = Room.objects.create(
            name=f"{request.user.username}'s Meeting",
            host=request.user
        )
        # Ensure creator is registered as host participant
        RoomParticipant.objects.get_or_create(
            room=room, 
            user=request.user, 
            defaults={'is_host': True}
        )
        return redirect('room_detail', room_id=room.room_id)
    return redirect('dashboard')

@login_required
def join_room_view(request):
    """Handles room joining via 9-digit code for authenticated users."""
    if request.method == 'POST':
        code_input = request.POST.get('room_id', '').strip()
        code_clean = "".join(filter(str.isdigit, code_input))
        
        room = Room.objects.filter(room_id=code_clean, is_active=True).first()
        if room:
            return redirect('room_detail', room_id=room.room_id)
        
        messages.error(request, "Invalid or expired Room ID. Please check the code and try again.")
        return redirect('dashboard')
    return redirect('dashboard')

def join_room_guest_view(request):
    """Allows unauthenticated users to join via numeric room code."""
    if request.method == 'POST':
        code_input = request.POST.get('room_id', '').strip()
        display_name = request.POST.get('display_name', '').strip()
        email = request.POST.get('email', '').strip()
        
        code_clean = "".join(filter(str.isdigit, code_input))
        room = Room.objects.filter(room_id=code_clean, is_active=True).first()

        if room:
            request.session['guest_name'] = display_name or "Guest User"
            request.session['guest_email'] = email
            return redirect('room_detail', room_id=room.room_id)

        messages.error(request, "Invalid Room ID. Please check and try again.")
        return redirect('login')
    return redirect('login')

@login_required
def schedule_room_view(request):
    """Schedules a future meeting session."""
    if request.method == 'POST':
        title = request.POST.get('title', 'Scheduled Meeting')
        room = Room.objects.create(
            name=title,
            host=request.user
        )
        RoomParticipant.objects.get_or_create(
            room=room, 
            user=request.user, 
            defaults={'is_host': True}
        )
        messages.success(request, f"Meeting '{title}' scheduled! Room ID: {room.room_id}")
        return redirect('dashboard')
    return redirect('dashboard')

def room_detail_view(request, room_id):
    """Renders WebRTC room interface handling both hosts and guests."""
    room = get_object_or_404(Room, room_id=room_id, is_active=True)
    
    is_host = False
    display_name = "User"

    if request.user.is_authenticated:
        display_name = request.user.username
        if room.host == request.user:
            is_host = True
        RoomParticipant.objects.get_or_create(
            room=room, 
            user=request.user, 
            defaults={'is_host': is_host}
        )
    elif 'guest_name' in request.session:
        display_name = request.session.get('guest_name')
        RoomParticipant.objects.get_or_create(
            room=room, 
            guest_name=display_name, 
            defaults={'is_host': False}
        )
    else:
        # Fallback if someone hits room URL directly without session or login
        return redirect('login')

    context = {
        'room': room,
        'room_id': room.room_id,
        'room_name': room.name,
        'is_host': is_host,
        'display_name': display_name,
    }
    return render(request, 'room.html', context)