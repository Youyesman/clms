#!/bin/bash

# Stop script on error
set -e

echo "Starting Frontend Setup..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js could not be found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

# Install yarn globally
if ! command -v yarn &> /dev/null; then
    echo "Installing yarn..."
    sudo npm install -g yarn
fi

# Navigate to project root then frontend directory
cd "$(dirname "$0")/../castingline_frontend"

# Install dependencies using yarn
echo "Installing Node dependencies with yarn..."
yarn install

# Build the project
echo "Building the project..."
yarn build

echo "Frontend Build Complete!"
echo "The build artifacts are located in castingline_frontend/build"
