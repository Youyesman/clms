#!/bin/bash

# Stop script on error
set -e

echo "Starting Backend Setup..."

# Update system
sudo DEBIAN_FRONTEND=noninteractive apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3-pip python3-venv libpq-dev

# Navigate to project root then backend directory
cd "$(dirname "$0")/../castingline_backend"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt
pip install gunicorn

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Run migrations
echo "Running migrations..."
python manage.py migrate

echo "Backend Setup Complete!"
echo "Please make sure to create a .env file with your production secrets."
