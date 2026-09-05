export default function UnauthorizedPage() {
  return (
    <div className="flex h-screen items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-red-600">403 Unauthorized</h1>
        <p className="mt-2 text-gray-600">You do not have permission to access the requested module.</p>
        <a href="/login" className="mt-4 inline-block text-blue-600 hover:underline">
          Return to Log In
        </a>
      </div>
    </div>
  )
}
