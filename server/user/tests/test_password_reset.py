import pytest
from django.urls import reverse
from django.core import mail
from django.contrib.auth import get_user_model
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.contrib.auth.tokens import default_token_generator

User = get_user_model()


@pytest.mark.django_db
class TestPasswordReset:
    def test_password_reset_request_sends_email(self, api_client, user_factory, mocker):
        user = user_factory(email="test@example.com")
        url = reverse("password_reset_request")
        data = {"email": "test@example.com"}

        # Mock SendGrid
        mock_sendgrid = mocker.patch("user.views.SendGridAPIClient")
        mock_instance = mock_sendgrid.return_value
        mock_instance.send.return_value.status_code = 202

        response = api_client.post(url, data)

        assert response.status_code == 200

        # Verify SendGrid was called
        mock_sendgrid.assert_called_once()
        mock_instance.send.assert_called_once()

        # Verify email content in the call args
        call_args = mock_instance.send.call_args
        sent_message = call_args[0][0]

        # Check if we can access content via get()
        message_dict = sent_message.get()

        assert sent_message.subject.subject == "Password Reset OTP"

        # Check content in the dictionary representation
        # content is a list of dicts: [{'type': 'text/html', 'value': '...'}]
        content_value = message_dict["content"][0]["value"]
        assert "Your password reset code is:" in content_value

    def test_password_reset_request_invalid_email(self, api_client, mocker):
        url = reverse("password_reset_request")
        data = {"email": "nonexistent@example.com"}

        mock_sendgrid = mocker.patch("user.views.SendGridAPIClient")

        response = api_client.post(url, data)

        # Should return 200 to avoid enumerating users
        assert response.status_code == 200
        mock_sendgrid.assert_not_called()

    def test_password_reset_confirm_success(self, api_client, user_factory):
        user = user_factory(password="old_password")
        # Create OTP manually
        from user.models import PasswordResetOTP
        from django.utils import timezone
        from datetime import timedelta

        otp = "123456"
        PasswordResetOTP.objects.create(
            user=user, otp=otp, expires_at=timezone.now() + timedelta(minutes=15)
        )

        url = reverse("password_reset_confirm")
        data = {"email": user.email, "otp": otp, "password": "new_secure_password_123"}

        response = api_client.post(url, data)

        assert response.status_code == 200
        user.refresh_from_db()
        assert user.check_password("new_secure_password_123")
        # OTP should be deleted
        assert not PasswordResetOTP.objects.filter(user=user, otp=otp).exists()

    def test_password_reset_confirm_invalid_otp(self, api_client, user_factory):
        user = user_factory()
        url = reverse("password_reset_confirm")
        data = {"email": user.email, "otp": "000000", "password": "new_password"}

        response = api_client.post(url, data)

        assert response.status_code == 400
