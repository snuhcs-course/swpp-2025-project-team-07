"""
Factory Boy factories for user app models.
"""
import factory
from factory.django import DjangoModelFactory
from faker import Faker

from user.models import User

fake = Faker()


class UserFactory(DjangoModelFactory):
    """
    Factory for creating User instances with realistic test data.

    Usage:
        # Create a user with default values
        user = UserFactory()

        # Create a user with custom values
        user = UserFactory(email='custom@example.com', username='customuser')

        # Create multiple users
        users = UserFactory.create_batch(5)

        # Create without saving to database
        user = UserFactory.build()
    """
    class Meta:
        model = User
        django_get_or_create = ('email',)

    email = factory.LazyAttribute(lambda _: fake.unique.email())
    username = factory.LazyAttribute(lambda _: fake.unique.user_name()[:30])
    is_active = True
    is_staff = False
    password = factory.PostGenerationMethodCall('set_password', 'testpassword123')


class StaffUserFactory(UserFactory):
    """
    Factory for creating staff users.
    """
    is_staff = True
    is_superuser = False


class SuperUserFactory(UserFactory):
    """
    Factory for creating superusers/admin users.
    """
    is_staff = True
    is_superuser = True
