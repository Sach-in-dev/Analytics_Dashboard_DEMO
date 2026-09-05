import { UsersPage } from "@/modules/users/section/users-page"


export const metadata = {
  title: "Users & Roles",
  description: "Manage user roles, permissions, and platform access configurations from a single interface. Ensure your team has the right level of access to perform their duties securely and efficiently.",
}

export default function Users() {
  return <UsersPage />
}
