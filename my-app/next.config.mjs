/** @type {import('next').NextConfig} */
const nextConfig = {
  // Configuração para múltiplos serviços
  async rewrites() {
    return [
      // Admin panel na porta 3001
      {
        source: '/admin-api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ]
  },
  
  // Configurações de desenvolvimento
  experimental: {
    // Permite múltiplos serviços
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig