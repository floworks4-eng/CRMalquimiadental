// Datos ficticios de la demo. Nombres, teléfonos y montos inventados; precios [ejemplo] (ver docs/clinica.md).
import type { DB, Patient, Appointment, ProcedureSupply, AnamnesisData } from './data'

const procedures = [
  { id: 'consulta', name: 'Consulta y diagnóstico', price: 100, minutes: 30 },
  { id: 'limpieza', name: 'Limpieza dental (profilaxis)', price: 150, minutes: 45 },
  { id: 'resina1', name: 'Resina 1 superficie', price: 160, minutes: 40 },
  { id: 'resina2', name: 'Resina 2 superficies', price: 200, minutes: 45 },
  { id: 'resina3', name: 'Resina 3 superficies', price: 330, minutes: 60 },
  { id: 'endo_uni', name: 'Endodoncia unirradicular', price: 400, minutes: 60 },
  { id: 'endo_multi', name: 'Endodoncia multirradicular', price: 650, minutes: 90 },
  { id: 'corona_mp', name: 'Corona metal-porcelana', price: 1530, minutes: 60 },
  { id: 'corona_cer', name: 'Corona cerámica', price: 1980, minutes: 60 },
  { id: 'extraccion', name: 'Extracción simple', price: 180, minutes: 30 },
  { id: 'blanqueamiento', name: 'Blanqueamiento en consultorio', price: 630, minutes: 60 },
  { id: 'orto_control', name: 'Control de ortodoncia', price: 162, minutes: 30 },
  { id: 'orto_montaje', name: 'Ortodoncia autoligado (montaje)', price: 1350, minutes: 90 },
]

const inventory = [
  { id: 'i-guantes', name: 'Guantes de nitrilo', unit: 'par', stock: 180, min: 100 },
  { id: 'i-mascarilla', name: 'Mascarillas descartables', unit: 'u.', stock: 120, min: 60 },
  { id: 'i-babero', name: 'Baberos', unit: 'u.', stock: 200, min: 80 },
  { id: 'i-eyector', name: 'Eyectores de saliva', unit: 'u.', stock: 150, min: 80 },
  { id: 'i-algodon', name: 'Rollos de algodón', unit: 'u.', stock: 380, min: 200 },
  { id: 'i-anestesia', name: 'Anestésico lidocaína 2 %', unit: 'carpule', stock: 31, min: 30 },
  { id: 'i-aguja', name: 'Agujas dentales cortas', unit: 'u.', stock: 52, min: 40 },
  { id: 'i-resina', name: 'Resina compuesta A2', unit: 'cápsula', stock: 24, min: 20 },
  { id: 'i-acido', name: 'Ácido grabador 37 %', unit: 'dosis', stock: 40, min: 20 },
  { id: 'i-adhesivo', name: 'Adhesivo universal', unit: 'dosis', stock: 45, min: 25 },
  { id: 'i-pasta', name: 'Pasta profiláctica', unit: 'dosis', stock: 18, min: 15 },
  { id: 'i-lima', name: 'Limas de endodoncia', unit: 'set', stock: 9, min: 6 },
  { id: 'i-gutapercha', name: 'Puntas de gutapercha', unit: 'u.', stock: 110, min: 60 },
  { id: 'i-impresion', name: 'Silicona de impresión', unit: 'dosis', stock: 7, min: 8 },
]

// «Receta» de insumos por procedimiento: kit base + insumos propios.
const KIT: [string, number][] = [['i-guantes', 2], ['i-mascarilla', 1], ['i-babero', 1], ['i-eyector', 1]]
const recipes: Record<string, [string, number][]> = {
  consulta: [['i-algodon', 2]],
  limpieza: [['i-pasta', 1], ['i-algodon', 4]],
  resina1: [['i-anestesia', 1], ['i-aguja', 1], ['i-resina', 1], ['i-acido', 1], ['i-adhesivo', 1], ['i-algodon', 4]],
  resina2: [['i-anestesia', 1], ['i-aguja', 1], ['i-resina', 2], ['i-acido', 1], ['i-adhesivo', 1], ['i-algodon', 4]],
  resina3: [['i-anestesia', 1], ['i-aguja', 1], ['i-resina', 3], ['i-acido', 1], ['i-adhesivo', 1], ['i-algodon', 6]],
  endo_uni: [['i-anestesia', 1], ['i-aguja', 1], ['i-lima', 1], ['i-gutapercha', 4], ['i-algodon', 6]],
  endo_multi: [['i-anestesia', 2], ['i-aguja', 1], ['i-lima', 1], ['i-gutapercha', 10], ['i-algodon', 8]],
  corona_mp: [['i-anestesia', 2], ['i-aguja', 1], ['i-impresion', 2], ['i-algodon', 4]],
  corona_cer: [['i-anestesia', 2], ['i-aguja', 1], ['i-impresion', 2], ['i-algodon', 4]],
  extraccion: [['i-anestesia', 2], ['i-aguja', 1], ['i-algodon', 6]],
  blanqueamiento: [['i-algodon', 4]],
  orto_control: [['i-algodon', 2]],
  orto_montaje: [['i-acido', 1], ['i-adhesivo', 1], ['i-algodon', 6]],
}
const procedureSupplies: ProcedureSupply[] = Object.entries(recipes).flatMap(([procedureId, list]) =>
  [...KIT, ...list].map(([itemId, qty]) => ({ procedureId, itemId, qty })),
)

const P = (
  n: number, name: string, birthDate: string, zone: string, source: Patient['source'], dentistId: string,
  status: Patient['status'], campaignId?: string,
): Patient => ({
  id: `p${n}`, name, birthDate, zone, source, dentistId, status, campaignId,
  phone: `+591 7000 ${String(1000 + n * 37).slice(-4)}`, createdAt: '2026-0' + ((n % 9) + 1) + '-1' + (n % 9),
})

const anamnesis = (allergies: string[], conditions: string[], reason: string): AnamnesisData => ({
  allergies, allergyOther: '', conditions, medications: conditions.includes('Hipertensión') ? 'Losartán 50 mg' : '',
  reason, emergencyContact: 'Familiar · +591 7000 0000 (demo)', consent: true, signature: 'Firmado digitalmente', submittedAt: '',
})

export function buildSeed(today: string): DB {
  const plus = (n: number) => {
    const d = new Date(today + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const patients: Patient[] = [
    P(1, 'Juan Carlos Quispe Mamani', '1990-04-12', 'Achumani', 'whatsapp', 'u-doc', 'en_tratamiento'),
    P(2, 'Wilma Condori Apaza', '1978-09-03', 'Obrajes', 'web', 'u-doc', 'en_tratamiento'),
    P(3, 'Fernando Limachi Torrez', '1985-01-22', 'Irpavi', 'whatsapp', 'u-doc', 'en_tratamiento'),
    P(4, 'Gabriela Rojas Salazar', '1996-06-30', 'San Miguel', 'campaign', 'u-doc', 'activo', 'cmp-limpieza'),
    P(5, 'Marco Antonio Huanca Rivero', '1972-11-15', 'Sopocachi', 'web', 'u-doc', 'activo'),
    P(6, 'Ana Lucía Paredes Vargas', '1999-02-08', 'Calacoto', 'campaign', 'u-val', 'activo', 'cmp-limpieza'),
    P(7, 'Daniela Céspedes Rocha', '2001-07-19', 'Miraflores', 'whatsapp', 'u-val', 'nuevo'),
    P(8, 'Silvia Poma Quisbert', '1988-12-01', 'Cota Cota', 'campaign', 'u-val', 'nuevo', 'cmp-orto'),
    P(9, 'Rodrigo Choque Flores', '1982-05-25', 'El Alto', 'whatsapp', 'u-ser', 'en_tratamiento'),
    P(10, 'Carla Gutiérrez Vargas', '1993-03-14', 'San Miguel', 'whatsapp', 'u-ser', 'activo'),
    P(11, 'Luis Fernando Ticona Paz', '1975-08-09', 'Alto Obrajes', 'historico', 'u-ser', 'en_tratamiento'),
    P(12, 'Rosario Callisaya Mendoza', '1969-10-27', 'Achumani', 'web', 'u-ser', 'nuevo'),
    P(13, 'Jhonny Apaza Limachi', '2017-05-03', 'Irpavi', 'campaign', 'u-val', 'activo', 'cmp-ninos'),
    P(14, 'Lucía Mamani Choque', '1960-01-17', 'Calacoto', 'historico', 'u-doc', 'inactivo'),
  ]
  patients[9].anamnesis = { ...anamnesis(['Penicilina'], ['Ninguno'], 'Dolor al masticar lado derecho'), submittedAt: '09:52' }
  patients[8].anamnesis = anamnesis(['Ninguna'], ['Diabetes'], 'Continuar endodoncia')
  patients[1].anamnesis = anamnesis(['Látex'], ['Hipertensión'], 'Corona pieza 36')
  patients[10].anamnesis = anamnesis(['AINE (ibuprofeno)'], ['Hipertensión'], 'Control endodoncia')

  let n = 0
  const A = (
    date: string, cabinetId: string, dentistId: string, start: string, duration: number, patientId: string, procedureId: string,
    status: Appointment['status'], source: Appointment['source'], campaignId?: string,
  ): Appointment => ({ id: `a${++n}`, date, cabinetId, dentistId, start, duration, patientId, procedureId, status, source, campaignId, createdAt: plus(-3) + ' 10:00' })

  const appointments: Appointment[] = [
    A(today, 'c1', 'u-doc', '08:30', 30, 'p1', 'orto_control', 'atendida', 'whatsapp'),
    A(today, 'c1', 'u-doc', '09:30', 60, 'p2', 'corona_mp', 'atendida', 'web'),
    A(today, 'c1', 'u-doc', '11:00', 90, 'p3', 'endo_multi', 'confirmada', 'whatsapp'),
    A(today, 'c1', 'u-doc', '15:00', 60, 'p4', 'blanqueamiento', 'confirmada', 'campaign', 'cmp-limpieza'),
    A(today, 'c1', 'u-doc', '17:00', 30, 'p5', 'extraccion', 'agendada', 'web'),
    A(today, 'c2', 'u-val', '09:00', 45, 'p6', 'limpieza', 'atendida', 'campaign', 'cmp-limpieza'),
    A(today, 'c2', 'u-val', '10:00', 30, 'p7', 'consulta', 'no_asistio', 'whatsapp'),
    A(today, 'c2', 'u-val', '12:00', 45, 'p8', 'consulta', 'confirmada', 'campaign', 'cmp-orto'),
    A(today, 'c2', 'u-val', '14:30', 30, 'p13', 'consulta', 'confirmada', 'campaign', 'cmp-ninos'),
    A(today, 'c3', 'u-ser', '09:00', 90, 'p9', 'endo_multi', 'en_atencion', 'whatsapp'),
    A(today, 'c3', 'u-ser', '10:30', 45, 'p10', 'resina1', 'en_espera', 'whatsapp'),
    A(today, 'c3', 'u-ser', '14:30', 60, 'p11', 'endo_uni', 'confirmada', 'web'),
    A(today, 'c3', 'u-ser', '16:30', 30, 'p12', 'consulta', 'agendada', 'web'),
    A(plus(1), 'c1', 'u-doc', '09:30', 45, 'p4', 'limpieza', 'confirmada', 'campaign', 'cmp-limpieza'),
    A(plus(1), 'c2', 'u-val', '10:00', 30, 'p7', 'consulta', 'agendada', 'whatsapp'),
    A(plus(2), 'c1', 'u-doc', '11:00', 60, 'p2', 'corona_mp', 'agendada', 'web'),
    A(plus(3), 'c3', 'u-ser', '15:00', 90, 'p9', 'endo_multi', 'confirmada', 'whatsapp'),
  ]
  appointments[10].checkedInAt = '09:52'

  return {
    version: 3,
    seedDate: today,
    session: null,
    demo: null,
    users: [
      { id: 'u-doc', name: 'Doc', role: 'admin', title: 'Director clínico · Odontólogo' },
      { id: 'u-val', name: 'Dra. Valeria Mamani', role: 'odontologo', title: 'Odontóloga general' },
      { id: 'u-ser', name: 'Dr. Sergio Choque', role: 'odontologo', title: 'Endodoncista' },
      { id: 'u-pao', name: 'Paola Condori', role: 'recepcion', title: 'Recepción' },
    ],
    patients,
    cabinets: [
      { id: 'c1', name: 'Gabinete 1' },
      { id: 'c2', name: 'Gabinete 2' },
      { id: 'c3', name: 'Gabinete 3' },
    ],
    appointments,
    clinicalRecords: [
      { id: 'r1', patientId: 'p2', date: today, dentistId: 'u-doc', summary: 'Cementado de corona; control en 15 días', procedures: ['Corona metal-porcelana (pieza 36)'], total: 1530 },
      { id: 'r2', patientId: 'p2', date: plus(-21), dentistId: 'u-doc', summary: 'Preparación pieza 36 e impresión', procedures: ['Consulta y diagnóstico'], total: 100 },
      { id: 'r3', patientId: 'p9', date: plus(-7), dentistId: 'u-ser', summary: 'Primera sesión endodoncia pieza 37', procedures: ['Endodoncia multirradicular (pieza 37) — 1.ª sesión'], total: 650 },
      { id: 'r4', patientId: 'p11', date: plus(-40), dentistId: 'u-ser', summary: 'Endodoncia pieza 46 concluida', procedures: ['Endodoncia multirradicular (pieza 46)'], total: 650 },
      { id: 'r5', patientId: 'p1', date: today, dentistId: 'u-doc', summary: 'Cambio de ligas, buena evolución', procedures: ['Control de ortodoncia'], total: 162 },
      { id: 'r6', patientId: 'p6', date: today, dentistId: 'u-val', summary: 'Profilaxis; sin caries activas', procedures: ['Limpieza dental (profilaxis)'], total: 150 },
      { id: 'r7', patientId: 'p10', date: plus(-90), dentistId: 'u-ser', summary: 'Diagnóstico: caries pieza 14', procedures: ['Consulta y diagnóstico'], total: 100 },
    ],
    odontogramEvents: [
      ['p2', 36, 'corona'], ['p2', 46, 'ausente'], ['p3', 26, 'endodoncia'], ['p3', 15, 'caries'], ['p9', 37, 'endodoncia'],
      ['p9', 48, 'ausente'], ['p10', 14, 'caries'], ['p11', 46, 'endodoncia'], ['p11', 16, 'corona'], ['p14', 18, 'ausente'], ['p14', 28, 'ausente'],
    ].map(([patientId, tooth, condition], i) => ({
      id: `o${i}`, patientId: patientId as string, tooth: tooth as number, condition: condition as DB['odontogramEvents'][0]['condition'],
      date: plus(-30), dentistId: 'u-doc',
    })),
    procedures,
    procedureSupplies,
    inventory,
    transactions: [
      { id: 't1', date: today, time: '08:40', concept: 'Compra de guantes de nitrilo (2 cajas)', amount: 180, method: 'efectivo', kind: 'egreso' },
      { id: 't2', date: today, time: '09:02', concept: 'Control de ortodoncia · Juan Carlos Quispe', amount: 162, method: 'qr', kind: 'ingreso', patientId: 'p1', appointmentId: 'a1' },
      { id: 't3', date: today, time: '09:48', concept: 'Limpieza dental (profilaxis) · Ana Lucía Paredes', amount: 150, method: 'efectivo', kind: 'ingreso', patientId: 'p6', appointmentId: 'a6' },
      { id: 't4', date: today, time: '10:35', concept: 'Corona metal-porcelana (pieza 36) · Wilma Condori', amount: 1530, method: 'transferencia', kind: 'ingreso', patientId: 'p2', appointmentId: 'a2' },
      { id: 't5', date: plus(-1), time: '18:10', concept: 'Endodoncia unirradicular · Luis Fernando Ticona', amount: 400, method: 'qr', kind: 'ingreso', patientId: 'p11' },
    ],
    campaigns: [
      { id: 'cmp-limpieza', name: 'Limpieza San Miguel', channel: 'TikTok orgánico + Meta Ads (3 km)', spend: 700, reach: 19500, conversations: 86, appts: 31, attended: 24, revenue: 6840 },
      { id: 'cmp-orto', name: 'Ortodoncia autoligado', channel: 'Meta Ads', spend: 900, reach: 14200, conversations: 52, appts: 14, attended: 9, revenue: 13500 },
      { id: 'cmp-ninos', name: 'Primera visita de niños', channel: 'TikTok orgánico', spend: 0, reach: 8300, conversations: 21, appts: 9, attended: 7, revenue: 1400 },
    ],
    notifications: [
      { id: 'n1', userId: 'u-ser', text: 'Carla Gutiérrez Vargas está en sala de espera · Gabinete 3 · ⚠ Alergia: Penicilina', href: '/consulta/a11', at: '09:52', read: false },
      { id: 'n2', userId: 'u-doc', text: 'Carla Gutiérrez Vargas está en sala de espera · Gabinete 3 · ⚠ Alergia: Penicilina', href: '/consulta/a11', at: '09:52', read: false },
      { id: 'n3', userId: 'u-doc', text: 'Stock bajo: Silicona de impresión (7 dosis, mínimo 8)', href: '/inventario', at: '08:00', read: false },
      { id: 'n4', userId: 'u-val', text: 'Silvia Poma confirmó su cita de las 12:00 por WhatsApp', href: '/agenda', at: '08:15', read: true },
      { id: 'n5', userId: 'u-pao', text: 'Daniela Céspedes no asistió a su cita de las 10:00 · ofrecer reprogramar', href: '/agenda', at: '10:20', read: false },
    ],
  }
}
