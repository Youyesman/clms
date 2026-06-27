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
# 서버 메모리 부족(OOM)으로 빌드가 죽던 문제 방지:
#  - GENERATE_SOURCEMAP=false : 소스맵 생성 안 함(메모리 대폭 절감)
#  - NODE_OPTIONS=--max-old-space-size=4096 : Node 힙 상한 확대
#  - CI=false : 경고를 에러로 처리하지 않음
echo "Building the project..."
CI=false GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=4096 yarn build

echo "Frontend Build Complete!"
echo "The build artifacts are located in castingline_frontend/build"
