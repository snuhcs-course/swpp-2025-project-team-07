from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView
from drf_yasg.utils import swagger_auto_schema
from drf_yasg import openapi
from .serializers import UserSignupSerializer, UserLoginSerializer, UserSerializer
from collection.vectordb_client import vectordb_client


@swagger_auto_schema(
    method='post',
    operation_description="Register a new user",
    request_body=UserSignupSerializer,
    responses={
        201: openapi.Response(
            description="User created successfully",
            examples={
                "application/json": {
                    "message": "User created successfully",
                    "user": {"id": 1, "email": "user@example.com", "username": "username"},
                    "refresh": "refresh_token_here",
                    "access": "access_token_here"
                }
            }
        ),
        400: "Bad Request"
    }
)
@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    serializer = UserSignupSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()

        # Create collections for the new user
        success, error = vectordb_client.create_collections_parallel(user_id=user.id)
        if not success:
            # Log error but don't fail signup - user can still use the system
            # Collections can be created later if needed
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create collections for user {user.id}: {error}")

        refresh = RefreshToken.for_user(user)
        return Response({
            'message': 'User created successfully',
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='post',
    operation_description="Login with email and password",
    request_body=UserLoginSerializer,
    responses={
        200: openapi.Response(
            description="Login successful",
            examples={
                "application/json": {
                    "message": "Login successful",
                    "user": {"id": 1, "email": "user@example.com", "username": "username"},
                    "refresh": "refresh_token_here",
                    "access": "access_token_here"
                }
            }
        ),
        400: "Invalid credentials"
    }
)
@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = UserLoginSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        user = serializer.validated_data['user']
        refresh = RefreshToken.for_user(user)
        return Response({
            'message': 'Login successful',
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='post',
    operation_description="Logout user by blacklisting refresh token",
    request_body=openapi.Schema(
        type=openapi.TYPE_OBJECT,
        properties={
            'refresh': openapi.Schema(type=openapi.TYPE_STRING, description='Refresh token to blacklist')
        }
    ),
    responses={
        200: openapi.Response(
            description="Logout successful",
            examples={
                "application/json": {"message": "Logout successful"}
            }
        ),
        400: "Bad Request"
    },
    security=[{'Bearer': []}]
)
@api_view(['POST'])
def logout(request):
    try:
        refresh_token = request.data.get('refresh')
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logout successful'}, status=status.HTTP_200_OK)
        return Response({'error': 'Refresh token required'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


@swagger_auto_schema(
    method='get',
    operation_description="Get current user's profile information",
    responses={
        200: openapi.Response(
            description="User profile retrieved successfully",
            schema=UserSerializer,
            examples={
                "application/json": {
                    "id": 1,
                    "email": "user@example.com",
                    "username": "username",
                    "date_joined": "2024-01-01T00:00:00Z"
                }
            }
        ),
        401: "Unauthorized - Invalid or missing token"
    },
    security=[{'Bearer': []}]
)
@api_view(['GET'])
def profile(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data, status=status.HTTP_200_OK)


class CustomTokenRefreshView(TokenRefreshView):
    pass
