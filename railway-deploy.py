#!/usr/bin/env python3
"""
Legacy Railway deployment helper. It does not deploy resources.
"""

import os
import json
import subprocess
import sys
from pathlib import Path

RAILWAY_API = "https://api.railway.app/graphql"

def get_railway_token():
    """Get Railway token from environment or user"""
    token = os.environ.get('RAILWAY_TOKEN')
    if token:
        return token
    
    print("\n❌ RAILWAY_TOKEN no configurado")
    print("\nConfigura RAILWAY_TOKEN en el entorno del proceso o usa Railway CLI.")
    print("No guardes tokens en archivos .env versionados.")
    
    sys.exit(1)

def query_railway_api(query, variables=None):
    """Query Railway GraphQL API"""
    token = get_railway_token()
    
    payload = {
        "query": query,
        "variables": variables or {}
    }
    
    import urllib.request
    import urllib.error
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(
        RAILWAY_API,
        data=json.dumps(payload).encode('utf-8'),
        headers=headers
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        print(f"❌ Error: {e.status} {e.reason}")
        print(e.read().decode())
        sys.exit(1)

def main():
    print("🚀 BACKSTAGE Backend - Deployment to Railway")
    print("=" * 50)
    
    token = get_railway_token()
    print("✅ RAILWAY_TOKEN está configurado (valor oculto).")
    
    print("\n📝 Para continuar con el deploy automático:")
    print("   Railway deployment is managed by .github/workflows/deploy-railway.yml on main.")
    print("\n⚠️  O usa el dashboard de Railway:")
    print("   1. Ve a https://railway.app/dashboard")
    print("   2. Crea un nuevo proyecto")
    print("   3. Conecta tu repositorio GitHub")
    print("   4. Configure PostgreSQL and production environment variables before deployment.")
    
    print("\n✨ El backend está listo para desplegar")
    print("   Carpeta: backend/")
    print("   Archivo principal: backend/index.js")
    print("   Database migrations: node-pg-migrate (run by the deployment workflow)")

if __name__ == "__main__":
    main()
