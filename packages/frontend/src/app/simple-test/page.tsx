'use client';

export default function SimpleTest() {
  console.log('✅ Simple test page loaded - no auth, no redirects');
  
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#000', 
      color: '#fff', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Simple Test Page</h1>
      <p>This page has NO authentication, NO useAuth, NO redirects.</p>
      <p>Current URL: {typeof window !== 'undefined' ? window.location.href : 'Loading...'}</p>
      <p>Timestamp: {new Date().toISOString()}</p>
      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: '#333', borderRadius: '8px' }}>
        <p><strong>If you can see this page without redirect:</strong></p>
        <p>The redirect is coming from authentication logic</p>
        <br />
        <p><strong>If this page also redirects:</strong></p>
        <p>The redirect is at browser/middleware level</p>
      </div>
    </div>
  );
}