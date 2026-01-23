#!/bin/bash

# Stop script on error
set -e

echo "Starting Frontend Setup..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js could not be found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Navigate to frontend directory
cd castingline_frontend

# Install dependencies
echo "Installing Node dependencies..."
npm install

# Build the project
echo "Building the project..."
npm run build

echo "Frontend Build Complete!"
echo "The build artifacts are located in castingline_frontend/build"
