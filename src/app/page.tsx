import { redirect } from 'next/navigation'

// La entrada del sistema es el panel; sin sesion, el proxy manda a /login.
export default function Home() {
  redirect('/inicio')
}
