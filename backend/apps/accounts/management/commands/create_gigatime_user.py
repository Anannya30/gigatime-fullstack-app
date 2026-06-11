"""Management command to create a GigaTIME user with a properly hashed password."""

from django.core.management.base import BaseCommand

from apps.accounts.models import User


class Command(BaseCommand):
    help = "Create a GigaTIME user with an email + hashed password."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)
        parser.add_argument("--first_name", default="")
        parser.add_argument("--lab_name", default="")

    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]

        user = User(
            email=email,
            first_name=options["first_name"],
            lab_name=options["lab_name"],
        )
        # set_password() hashes the password so the account has a usable password.
        user.set_password(password)
        user.save()

        self.stdout.write(f"User created: {email}")
