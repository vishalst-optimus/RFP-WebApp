#!/bin/sh

# Set default backend URL if not provided
BACKEND_URL=${BACKEND_URL:-"https://ca-rfpsaas-eus2-prod-001.mangocliff-47186dbe.eastus2.azurecontainerapps.io"}

echo "🚀 Starting Frontend with Backend URL: $BACKEND_URL"

# Substitute environment variables in nginx config
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Remove template file
rm -f /etc/nginx/conf.d/default.conf.template

# Test nginx configuration
nginx -t

# Start nginx
echo "✅ Nginx configuration valid. Starting nginx..."
nginx -g "daemon off;"