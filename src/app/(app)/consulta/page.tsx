import { redirect } from 'next/navigation'

export default function ConsultaIndex() {
  redirect('/agenda?vista=espera')
}
