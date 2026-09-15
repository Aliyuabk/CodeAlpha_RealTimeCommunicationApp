"""
ASGI config for core project.

It exposes the ASGI callable as a module-level variable named ``application``.
Routing is handled via ProtocolTypeRouter to separate standard HTTP requests
and WebSocket connections for WebRTC signaling.
"""

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# Initialize Django ASGI application early to ensure the AppRegistry is loaded
# before importing consumers and routing modules.
django_asgi_app = get_asgi_application()

import rooms.routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            rooms.routing.websocket_urlpatterns
        )
    ),
})