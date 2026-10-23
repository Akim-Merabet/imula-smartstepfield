import { redirect } from "next/navigation";

export default function ProfileRoot() {
  redirect("/explore/profile/user-info");
}
