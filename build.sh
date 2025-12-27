#!/bin/bash

# RFP Application Build Script

set -e

echo "🚀 Building RFP Application..."

# Function to build individual service
build_service() {
    local service=$1
    local context=$2
    
    echo "Building $service..."
    docker build -t rfp-$service:latest $context
    echo "✅ $service build complete"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [frontend|backend|all]"
    echo "  frontend  - Build React frontend only"
    echo "  backend   - Build Python backend only"
    echo "  all       - Build all services (default)"
}

# Parse arguments
case "${1:-all}" in
    "frontend")
        build_service "frontend" "./apps/frontend/react/rfp-agent"
        ;;
    "backend")
        build_service "backend" "./apps/backend"
        ;;
    "all")
        echo "🔨 Building all services..."
        build_service "backend" "./apps/backend"
        build_service "frontend" "./apps/frontend/react/rfp-agent"
        echo "🎉 All services built successfully!"
        ;;
    "help"|"-h"|"--help")
        show_usage
        exit 0
        ;;
    *)
        echo "❌ Unknown option: $1"
        show_usage
        exit 1
        ;;
esac

echo ""
echo "🐳 Docker images:"
docker images | grep rfp-

echo ""
echo "💡 To run the application:"
echo "   docker-compose up -d"