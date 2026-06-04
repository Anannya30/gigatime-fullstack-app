from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Custom user model for GigaTIME.

    Declared up front (referenced by ``AUTH_USER_MODEL``) so that
    account-specific fields and Google OAuth wiring can be added later
    without a painful user-model swap. Intentionally empty for now.
    """

    pass
