export default function TestHomepage() {
  console.log('🧪 Test homepage loaded successfully');
  
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Test Homepage</h1>
        <p className="text-xl mb-8">This page bypasses all authentication and redirect logic.</p>
        <p className="text-lg">If you can see this, the redirect is not coming from Next.js routing.</p>
        <div className="mt-8 p-4 bg-gray-800 rounded">
          <p className="text-sm">Current URL: {typeof window !== 'undefined' ? window.location.href : 'Server-side'}</p>
          <p className="text-sm">Timestamp: {new Date().toISOString()}</p>
        </div>
      </div>
    </div>
  );
}