# Backend setup (safe sample)

Do NOT add real secrets to source control. This repository intentionally excludes the `Backend/.env` file and the `Backend/db.sqlite3` database to keep secrets and local data private.

To run the backend locally for evaluation/assignment purposes:

1. Create a `.env` file in `Backend/` by copying the example:

   cp .env.example .env

2. Fill in the real values in `Backend/.env` (do not commit this file).

3. Install dependencies and run migrations:

   pip install -r requirements.txt
   python manage.py migrate

4. (Optional) Create a superuser to test the admin:

   python manage.py createsuperuser

5. Run the development server:

   python manage.py runserver

If you need a sample database without real data, either run `migrate` and create sample objects locally or ask for a scrubbed `db.sqlite3` that contains only demo data.
