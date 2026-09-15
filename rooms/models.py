import random
from django.db import models
from django.contrib.auth.models import User

def generate_room_code():
    """Generates a unique 9-digit numeric room code (e.g., 839201847)."""
    return str(random.randint(100_000_000, 999_999_999))

class Room(models.Model):
    room_id = models.CharField(
        max_length=12, 
        default=generate_room_code, 
        unique=True, 
        editable=False
    )
    name = models.CharField(max_length=255)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_rooms')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.room_id})"


class RoomParticipant(models.Model):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    guest_name = models.CharField(max_length=100, blank=True, null=True)
    is_host = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        name = self.user.username if self.user else self.guest_name
        role = "Host" if self.is_host else "Guest"
        return f"{name} ({role}) in {self.room.room_id}"