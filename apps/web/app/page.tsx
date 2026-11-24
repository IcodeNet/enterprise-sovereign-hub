import { redirect } from "next/navigation";

// The site's home page has nothing of its own to show yet — this project is
// just the one chat demo — so visiting the root URL sends you straight to it
// instead of showing an empty page or a confusing 404.
export default function Home() {
  redirect("/chat");
}
