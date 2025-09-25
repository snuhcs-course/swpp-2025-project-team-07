# Stage 1: Builder Stage - Installs dependencies and compilation tools
FROM python:3.10-slim AS builder

# Set environment variables for non-interactive commands
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set the working directory
WORKDIR /usr/src/app

# Install dependencies needed for compiling Python packages (like 'mysqlclient' for MySQL)
# 'default-libmysqlclient-dev' is essential for MySQL database drivers
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc default-libmysqlclient-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
# This layer is cached and re-used unless requirements.txt changes.
COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Stage 2: Production Final Stage - Minimal image for running the app
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PORT 8000

# Set the working directory
WORKDIR /usr/src/app

# Install runtime dependencies (only the necessary libraries, not the compilers)
# 'default-mysql-client' is the library needed to connect to MySQL RDS at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-mysql-client libmariadb3 \
    && rm -rf /var/lib/apt/lists/*

# Copy only the installed Python packages from the builder stage
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages

# Copy the entire Django project directory
COPY . .

# Expose the application port
EXPOSE 8000

# Create a startup script that handles migrations and static files
RUN echo '#!/bin/bash\n\
python manage.py migrate --noinput\n\
python manage.py collectstatic --noinput\n\
gunicorn --bind 0.0.0.0:8000 config.wsgi\n' > /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Define the command to run the application
CMD ["/usr/src/app/start.sh"]