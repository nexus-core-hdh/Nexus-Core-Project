"use client";

import { ProfilePage } from "./components/ProfilePage";
import { useSearchParams } from "next/navigation";

export default function UserProfilePage() {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get("id");
  const userId = userIdParam ? parseInt(userIdParam) : undefined;

  return <ProfilePage userId={userId} />;
}
