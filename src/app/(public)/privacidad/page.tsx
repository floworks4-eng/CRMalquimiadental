import type { Metadata } from 'next'
import { PublicShell } from '@/components/public-shell'

export const metadata: Metadata = { title: 'Privacidad · Alquimia Dental' }

// BORRADOR TECNICO. Describe solo lo que el sistema hace de verdad. El aviso legal definitivo lo redacta y revisa un abogado
// boliviano (brief §6.9); los datos marcados [PENDIENTE] los entrega la clinica.
export default function PrivacidadPage() {
  return (
    <PublicShell wide>
      <h1 className="title-gold mb-2 text-4xl">Privacidad</h1>
      <p className="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
        Borrador pendiente de revisión legal. Describe cómo funciona el sistema; no reemplaza el aviso de privacidad oficial de la clínica.
      </p>
      <div className="glass space-y-5 p-6 text-sm leading-relaxed text-bone">
        <section>
          <h2 className="title-gold text-lg">Qué datos se registran</h2>
          <p className="mt-1">Al reservar: nombre, celular y el origen de la visita (por ejemplo, el anuncio por el que llegaste). Al hacer el check-in: fecha de nacimiento, contacto de emergencia, alergias, antecedentes, medicamentos, motivo de consulta, tu consentimiento y tu firma.</p>
        </section>
        <section>
          <h2 className="title-gold text-lg">Para qué se usan</h2>
          <p className="mt-1">Para agendar y atender tu cita y llevar tu historia clínica. Los recordatorios por WhatsApp solo se envían si los aceptas, y puedes pedir la baja cuando quieras.</p>
        </section>
        <section>
          <h2 className="title-gold text-lg">Quién los ve</h2>
          <p className="mt-1">Cada persona del equipo ve solo lo que necesita: recepción ve tus datos de contacto y tus citas, pero no tus datos de salud; tus datos clínicos solo los ve el odontólogo que te atiende y la dirección de la clínica. Cada acceso y cada cambio queda registrado.</p>
        </section>
        <section>
          <h2 className="title-gold text-lg">Dónde se guardan</h2>
          <p className="mt-1">En servidores de proveedores en la nube ubicados fuera de Bolivia (Brasil y Estados Unidos), con acceso restringido y cifrado. [PENDIENTE: proveedores definitivos y acuerdos de tratamiento de datos.]</p>
        </section>
        <section>
          <h2 className="title-gold text-lg">Tus derechos y contacto</h2>
          <p className="mt-1">Puedes pedir ver o corregir tus datos. La historia clínica se conserva el tiempo que exija la norma. [PENDIENTE: responsable, correo y teléfono de contacto de la clínica.]</p>
        </section>
      </div>
    </PublicShell>
  )
}
