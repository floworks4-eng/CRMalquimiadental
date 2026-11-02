// Numeración ISO 3950 / FDI World Dental Federation.
// Orden visual clínico: lado derecho del paciente a la izquierda de la pantalla.
export type Dentition = 'permanente' | 'temporal'
export type ToothKind = 'incisivo' | 'canino' | 'premolar' | 'molar'
export type PatientZoneId = 'upper-right' | 'upper-left' | 'lower-left' | 'lower-right'

export interface Tooth3DCoords {
  fdi: number
  structureId: string
  center: [number, number, number]
  crownCenter: [number, number, number]
  rootApex: [number, number, number]
  hotspotPosition: string
  hotspotNormal: string
  orbitThetaDeg: number
}

export interface ToothInfo {
  fdi: number
  name: string
  labelWithNumber: string
  shortType: string
  kind: ToothKind
  dentition: Dentition
  dentitionLabel: string
  quadrant: number
  positionFromMidline: number
  zoneId: PatientZoneId
  zoneLabel: 'Arriba derecha' | 'Arriba izquierda' | 'Abajo izquierda' | 'Abajo derecha'
  archLabel: 'Arcada superior (maxilar)' | 'Arcada inferior (mandíbula)'
  patientSideLabel: 'Lado derecho del paciente' | 'Lado izquierdo del paciente'
  patientFunction: string
  surfacesSummary: string
  neurovascularSupply: string
  in3DModel: boolean
  missing3DReason?: string
  coords3D?: Tooth3DCoords
}

export interface QuadrantZoneGroup {
  zoneId: PatientZoneId
  quadrant: number
  label: 'Arriba derecha' | 'Arriba izquierda' | 'Abajo izquierda' | 'Abajo derecha'
  patientOrientation: string
  arch: 'upper' | 'lower'
  patientSide: 'right' | 'left'
  teeth: number[]
}

const range = (q: number, n: number, reverse: boolean) => {
  const r = Array.from({ length: n }, (_, i) => q * 10 + i + 1)
  return reverse ? r.reverse() : r
}

export function teethRows(d: Dentition) {
  const n = d === 'permanente' ? 8 : 5
  const [q1, q2, q3, q4] = d === 'permanente' ? [1, 2, 3, 4] : [5, 6, 7, 8]
  return {
    upper: [...range(q1, n, true), ...range(q2, n, false)],
    lower: [...range(q4, n, true), ...range(q3, n, false)],
  }
}

export function teethQuadrants(d: Dentition): {
  upperRight: QuadrantZoneGroup
  upperLeft: QuadrantZoneGroup
  lowerRight: QuadrantZoneGroup
  lowerLeft: QuadrantZoneGroup
} {
  const n = d === 'permanente' ? 8 : 5
  const [q1, q2, q3, q4] = d === 'permanente' ? [1, 2, 3, 4] : [5, 6, 7, 8]
  return {
    upperRight: {
      zoneId: 'upper-right',
      quadrant: q1,
      label: 'Arriba derecha',
      patientOrientation: `Cuadrante ${q1} · Derecha superior del paciente`,
      arch: 'upper',
      patientSide: 'right',
      teeth: range(q1, n, true),
    },
    upperLeft: {
      zoneId: 'upper-left',
      quadrant: q2,
      label: 'Arriba izquierda',
      patientOrientation: `Cuadrante ${q2} · Izquierda superior del paciente`,
      arch: 'upper',
      patientSide: 'left',
      teeth: range(q2, n, false),
    },
    lowerRight: {
      zoneId: 'lower-right',
      quadrant: q4,
      label: 'Abajo derecha',
      patientOrientation: `Cuadrante ${q4} · Derecha inferior del paciente`,
      arch: 'lower',
      patientSide: 'right',
      teeth: range(q4, n, true),
    },
    lowerLeft: {
      zoneId: 'lower-left',
      quadrant: q3,
      label: 'Abajo izquierda',
      patientOrientation: `Cuadrante ${q3} · Izquierda inferior del paciente`,
      arch: 'lower',
      patientSide: 'left',
      teeth: range(q3, n, false),
    },
  }
}

export function dentitionForTooth(n: number): Dentition {
  return n >= 50 ? 'temporal' : 'permanente'
}

export function kind(n: number): ToothKind {
  const d = n % 10
  if (d <= 2) return 'incisivo'
  if (d === 3) return 'canino'
  if (n >= 50) return 'molar'
  return d <= 5 ? 'premolar' : 'molar'
}

export const isUpper = (n: number) => [1, 2, 5, 6].includes(Math.floor(n / 10))

/** Lado en pantalla: −1 = izquierda (lado derecho del paciente). */
export const side = (n: number) => ([1, 4, 5, 8].includes(Math.floor(n / 10)) ? -1 : 1)

export const TOOTH_3D_COORDS: Record<number, Tooth3DCoords> = {
  11: {
    fdi: 11,
    structureId: 'upper-right-central-incisor',
    center: [-0.1035, -0.3618, 1.0149],
    crownCenter: [-0.1091, -0.4944, 1.0744],
    rootApex: [-0.0803, 0.0318, 0.8511],
    hotspotPosition: '-0.0664m -0.5435m 1.1594m',
    hotspotNormal: '-0.0742m -0.1058m 0.9916m',
    orbitThetaDeg: -4.4,
  },
  12: {
    fdi: 12,
    structureId: 'upper-right-lateral-incisor',
    center: [-0.2758, -0.325, 0.9392],
    crownCenter: [-0.3068, -0.5025, 0.9921],
    rootApex: [-0.2305, 0.0775, 0.8179],
    hotspotPosition: '-0.2785m -0.578m 1.0826m',
    hotspotNormal: '-0.1836m -0.0054m 0.983m',
    orbitThetaDeg: -12.9,
  },
  13: {
    fdi: 13,
    structureId: 'upper-right-canine',
    center: [-0.4242, -0.2733, 0.8338],
    crownCenter: [-0.4578, -0.479, 0.8651],
    rootApex: [-0.3563, 0.1755, 0.7566],
    hotspotPosition: '-0.4864m -0.4375m 0.9624m',
    hotspotNormal: '-0.4769m 0.0178m 0.8788m',
    orbitThetaDeg: -20.6,
  },
  14: {
    fdi: 14,
    structureId: 'upper-right-first-premolar',
    center: [-0.5001, -0.2465, 0.6648],
    crownCenter: [-0.5192, -0.48, 0.664],
    rootApex: [-0.4967, 0.1423, 0.658],
    hotspotPosition: '-0.6101m -0.4645m 0.7412m',
    hotspotNormal: '-0.7072m -0.1072m 0.6988m',
    orbitThetaDeg: -27.1,
  },
  15: {
    fdi: 15,
    structureId: 'upper-right-second-premolar',
    center: [-0.5807, -0.2203, 0.5169],
    crownCenter: [-0.5938, -0.4547, 0.5068],
    rootApex: [-0.5244, 0.1075, 0.492],
    hotspotPosition: '-0.6895m -0.4302m 0.5685m',
    hotspotNormal: '-0.8306m 0.0298m 0.5561m',
    orbitThetaDeg: -34.7,
  },
  16: {
    fdi: 16,
    structureId: 'upper-right-first-molar',
    center: [-0.6272, -0.1999, 0.2957],
    crownCenter: [-0.6312, -0.4138, 0.2823],
    rootApex: [-0.497, 0.1233, 0.2798],
    hotspotPosition: '-0.7483m -0.3685m 0.3694m',
    hotspotNormal: '-0.9198m 0.0016m 0.3925m',
    orbitThetaDeg: -45.0,
  },
  17: {
    fdi: 17,
    structureId: 'upper-right-second-molar',
    center: [-0.6306, -0.1055, 0.0688],
    crownCenter: [-0.6473, -0.326, 0.0551],
    rootApex: [-0.475, 0.1663, 0.0489],
    hotspotPosition: '-0.7554m -0.2935m 0.0898m',
    hotspotNormal: '-0.9967m 0.0676m -0.0447m',
    orbitThetaDeg: -58.0,
  },
  21: {
    fdi: 21,
    structureId: 'upper-left-central-incisor',
    center: [0.1092, -0.3603, 1.0123],
    crownCenter: [0.1124, -0.5002, 1.0766],
    rootApex: [0.0784, 0.0325, 0.8471],
    hotspotPosition: '0.0609m -0.5445m 1.1597m',
    hotspotNormal: '0.0577m -0.1247m 0.9905m',
    orbitThetaDeg: 4.5,
  },
  22: {
    fdi: 22,
    structureId: 'upper-left-lateral-incisor',
    center: [0.2747, -0.3266, 0.9402],
    crownCenter: [0.3073, -0.5082, 0.996],
    rootApex: [0.2308, 0.0777, 0.8182],
    hotspotPosition: '0.289m -0.5665m 1.0905m',
    hotspotNormal: '0.258m 0.0694m 0.9637m',
    orbitThetaDeg: 12.9,
  },
  23: {
    fdi: 23,
    structureId: 'upper-left-canine',
    center: [0.4242, -0.2826, 0.8389],
    crownCenter: [0.453, -0.4763, 0.8684],
    rootApex: [0.3566, 0.1758, 0.7575],
    hotspotPosition: '0.4791m -0.439m 0.9663m',
    hotspotNormal: '0.3943m 0.0141m 0.9189m',
    orbitThetaDeg: 20.4,
  },
  24: {
    fdi: 24,
    structureId: 'upper-left-first-premolar',
    center: [0.4958, -0.2317, 0.6652],
    crownCenter: [0.5163, -0.4802, 0.6646],
    rootApex: [0.4956, 0.142, 0.6576],
    hotspotPosition: '0.6096m -0.451m 0.7406m',
    hotspotNormal: '0.7045m 0.0798m 0.7052m',
    orbitThetaDeg: 27.0,
  },
  25: {
    fdi: 25,
    structureId: 'upper-left-second-premolar',
    center: [0.5795, -0.2137, 0.5166],
    crownCenter: [0.597, -0.457, 0.5065],
    rootApex: [0.5211, 0.1075, 0.4948],
    hotspotPosition: '0.6912m -0.4365m 0.5655m',
    hotspotNormal: '0.7969m 0.0044m 0.6042m',
    orbitThetaDeg: 34.9,
  },
  26: {
    fdi: 26,
    structureId: 'upper-left-first-molar',
    center: [0.6275, -0.184, 0.2973],
    crownCenter: [0.6308, -0.4133, 0.2825],
    rootApex: [0.4966, 0.1238, 0.2819],
    hotspotPosition: '0.7502m -0.3672m 0.3633m',
    hotspotNormal: '0.9485m 0.0105m 0.3165m',
    orbitThetaDeg: 44.9,
  },
  27: {
    fdi: 27,
    structureId: 'upper-left-second-molar',
    center: [0.6314, -0.1108, 0.0685],
    crownCenter: [0.6485, -0.3255, 0.0516],
    rootApex: [0.4693, 0.166, 0.0471],
    hotspotPosition: '0.7543m -0.312m 0.0926m',
    hotspotNormal: '0.9948m -0.058m 0.0841m',
    orbitThetaDeg: 58.2,
  },
  31: {
    fdi: 31,
    structureId: 'lower-left-central-incisor',
    center: [0.0636, -0.8677, 0.8282],
    crownCenter: [0.0747, -0.6799, 0.9579],
    rootApex: [0.0481, -1.2352, 0.5923],
    hotspotPosition: '0.0673m -0.6288m 1.0383m',
    hotspotNormal: '0.0881m 0.0269m 0.9957m',
    orbitThetaDeg: 3.3,
  },
  32: {
    fdi: 32,
    structureId: 'lower-left-lateral-incisor',
    center: [0.1839, -0.8386, 0.8309],
    crownCenter: [0.2154, -0.685, 0.9293],
    rootApex: [0.1255, -1.2277, 0.6058],
    hotspotPosition: '0.2049m -0.632m 1.0215m',
    hotspotNormal: '0.1414m 0.0154m 0.9898m',
    orbitThetaDeg: 9.6,
  },
  33: {
    fdi: 33,
    structureId: 'lower-left-canine',
    center: [0.314, -0.8676, 0.7395],
    crownCenter: [0.343, -0.6711, 0.8369],
    rootApex: [0.2935, -1.2585, 0.5464],
    hotspotPosition: '0.3535m -0.6553m 0.9216m',
    hotspotNormal: '0.268m 0.0357m 0.9628m',
    orbitThetaDeg: 16.1,
  },
  34: {
    fdi: 34,
    structureId: 'lower-left-first-premolar',
    center: [0.4301, -0.7834, 0.603],
    crownCenter: [0.429, -0.6492, 0.6563],
    rootApex: [0.4465, -1.1352, 0.4325],
    hotspotPosition: '0.4779m -0.6758m 0.7433m',
    hotspotNormal: '0.4956m -0.0631m 0.8663m',
    orbitThetaDeg: 23.1,
  },
  35: {
    fdi: 35,
    structureId: 'lower-left-second-premolar',
    center: [0.5177, -0.7463, 0.4356],
    crownCenter: [0.5042, -0.6178, 0.4892],
    rootApex: [0.5374, -1.1257, 0.2966],
    hotspotPosition: '0.5858m -0.6525m 0.5481m',
    hotspotNormal: '0.702m 0.0092m 0.7121m',
    orbitThetaDeg: 31.0,
  },
  36: {
    fdi: 36,
    structureId: 'lower-left-first-molar',
    center: [0.5885, -0.6768, 0.2252],
    crownCenter: [0.5509, -0.5417, 0.27],
    rootApex: [0.6084, -0.9595, 0.1801],
    hotspotPosition: '0.6917m -0.634m 0.3488m',
    hotspotNormal: '0.8813m -0.1434m 0.4503m',
    orbitThetaDeg: 41.6,
  },
  37: {
    fdi: 37,
    structureId: 'lower-left-second-molar',
    center: [0.6773, -0.5785, -0.0444],
    crownCenter: [0.6292, -0.4566, 0.0184],
    rootApex: [0.7281, -0.8255, -0.1255],
    hotspotPosition: '0.8017m -0.55m 0.0292m',
    hotspotNormal: '0.9156m 0.2297m 0.3299m',
    orbitThetaDeg: 59.7,
  },
  41: {
    fdi: 41,
    structureId: 'lower-right-central-incisor',
    center: [-0.0649, -0.8669, 0.829],
    crownCenter: [-0.0763, -0.6866, 0.956],
    rootApex: [-0.0502, -1.2348, 0.5962],
    hotspotPosition: '-0.0622m -0.6308m 1.0388m',
    hotspotNormal: '-0.084m -0.0248m 0.9962m',
    orbitThetaDeg: -3.3,
  },
  42: {
    fdi: 42,
    structureId: 'lower-right-lateral-incisor',
    center: [-0.1823, -0.8372, 0.8376],
    crownCenter: [-0.2135, -0.6915, 0.9366],
    rootApex: [-0.1231, -1.2277, 0.6043],
    hotspotPosition: '-0.208m -0.6352m 1.021m',
    hotspotNormal: '-0.2535m -0.098m 0.9624m',
    orbitThetaDeg: -9.4,
  },
  43: {
    fdi: 43,
    structureId: 'lower-right-canine',
    center: [-0.3174, -0.8753, 0.7352],
    crownCenter: [-0.3435, -0.6759, 0.8288],
    rootApex: [-0.2963, -1.2585, 0.5474],
    hotspotPosition: '-0.3621m -0.6557m 0.9184m',
    hotspotNormal: '-0.5068m -0.0643m 0.8597m',
    orbitThetaDeg: -16.2,
  },
  44: {
    fdi: 44,
    structureId: 'lower-right-first-premolar',
    center: [-0.4269, -0.7832, 0.6039],
    crownCenter: [-0.4236, -0.6521, 0.6571],
    rootApex: [-0.4484, -1.1355, 0.4327],
    hotspotPosition: '-0.4794m -0.6785m 0.7427m',
    hotspotNormal: '-0.5058m -0.0713m 0.8597m',
    orbitThetaDeg: -22.8,
  },
  45: {
    fdi: 45,
    structureId: 'lower-right-second-premolar',
    center: [-0.5132, -0.7356, 0.4383],
    crownCenter: [-0.5003, -0.6112, 0.4864],
    rootApex: [-0.5414, -1.1257, 0.2945],
    hotspotPosition: '-0.5877m -0.653m 0.5468m',
    hotspotNormal: '-0.7257m 0.0251m 0.6875m',
    orbitThetaDeg: -30.9,
  },
  46: {
    fdi: 46,
    structureId: 'lower-right-first-molar',
    center: [-0.5904, -0.6831, 0.2232],
    crownCenter: [-0.5586, -0.5425, 0.2685],
    rootApex: [-0.6098, -0.9595, 0.1765],
    hotspotPosition: '-0.694m -0.62m 0.3468m',
    hotspotNormal: '-0.9017m -0.0144m 0.432m',
    orbitThetaDeg: -42.1,
  },
  47: {
    fdi: 47,
    structureId: 'lower-right-second-molar',
    center: [-0.6745, -0.5697, -0.0397],
    crownCenter: [-0.6248, -0.4561, 0.0175],
    rootApex: [-0.7297, -0.825, -0.1147],
    hotspotPosition: '-0.8043m -0.5055m -0.0806m',
    hotspotNormal: '-0.7335m 0.6151m -0.2891m',
    orbitThetaDeg: -59.5,
  },
}

const PERMANENT_SHORT_TYPES: Record<number, string> = {
  1: 'Incisivo central',
  2: 'Incisivo lateral',
  3: 'Canino',
  4: 'Primer premolar',
  5: 'Segundo premolar',
  6: 'Primer molar',
  7: 'Segundo molar',
  8: 'Tercer molar',
}

const PRIMARY_SHORT_TYPES: Record<number, string> = {
  1: 'Incisivo central',
  2: 'Incisivo lateral',
  3: 'Canino',
  4: 'Primer molar',
  5: 'Segundo molar',
}

export function getToothInfo(fdi: number): ToothInfo {
  const quadrant = Math.floor(fdi / 10)
  const pos = fdi % 10
  const isPrimary = quadrant >= 5
  const dentition: Dentition = isPrimary ? 'temporal' : 'permanente'
  const upper = isUpper(fdi)
  const rightSide = side(fdi) === -1

  const archWord = upper ? 'superior' : 'inferior'
  const sideWord = rightSide ? 'derecho' : 'izquierdo'
  const shortType = isPrimary
    ? (PRIMARY_SHORT_TYPES[pos] ?? `Pieza ${pos}`)
    : (PERMANENT_SHORT_TYPES[pos] ?? `Pieza ${pos}`)

  const name = isPrimary
    ? `${shortType} ${archWord} ${sideWord} temporal`
    : `${shortType} ${archWord} ${sideWord}`

  const zoneId: PatientZoneId = upper
    ? rightSide
      ? 'upper-right'
      : 'upper-left'
    : rightSide
      ? 'lower-right'
      : 'lower-left'

  const zoneLabel = upper
    ? rightSide
      ? 'Arriba derecha'
      : 'Arriba izquierda'
    : rightSide
      ? 'Abajo derecha'
      : 'Abajo izquierda'

  const archLabel = upper ? 'Arcada superior (maxilar)' : 'Arcada inferior (mandíbula)'
  const patientSideLabel = rightSide ? 'Lado derecho del paciente' : 'Lado izquierdo del paciente'

  let patientFunction: string
  if (pos <= 2) {
    patientFunction =
      'Pieza anterior de borde cortante para seccionar alimentos; presenta una raíz cónica única.'
  } else if (pos === 3) {
    patientFunction =
      'Pieza de esquina con cúspide firme que guía el cierre mandibular; tiene la raíz más larga de su arcada.'
  } else if (!isPrimary && pos <= 5) {
    patientFunction =
      fdi === 14 || fdi === 24
        ? 'Premolar triturador con dos cúspides; suele presentar dos raíces (vestibular y palatina).'
        : 'Premolar triturador con dos cúspides; habitualmente presenta una raíz única.'
  } else if (!isPrimary && pos === 8) {
    patientFunction =
      'Tercer molar (muela del juicio), última pieza posterior de la arcada; su erupción y raíces varían según cada paciente.'
  } else if (isPrimary) {
    patientFunction =
      'Molar temporal infantil para masticación que conserva el espacio óseo de los futuros premolares permanentes.'
  } else {
    patientFunction = upper
      ? 'Molar triturador posterior de corona ancha; suele anclarse en el maxilar mediante tres raíces (dos vestibulares y una palatina).'
      : 'Molar triturador posterior de corona ancha; suele anclarse en la mandíbula mediante dos raíces (mesial y distal).'
  }

  const surfacesSummary =
    pos <= 3
      ? 'Borde incisal (corte), cara vestibular (hacia el labio), cara interna (palatina o lingual) y caras laterales (mesial y distal).'
      : 'Cara oclusal (masticatoria), cara vestibular (hacia la mejilla), cara interna (palatina o lingual) y caras laterales (mesial y distal).'

  let neurovascularSupply: string
  if (upper && pos <= 3) {
    neurovascularSupply =
      'Nervios alveolar superior anterior y nasopalatino · Ramas alveolares superiores y palatinas'
  } else if (upper && pos <= 5) {
    neurovascularSupply =
      'Nervios alveolar superior medio y palatino mayor · Arterias alveolar superior y palatina mayor'
  } else if (upper) {
    neurovascularSupply =
      'Nervios alveolar superior posterior y palatino mayor · Arteria alveolar superior posterior (ramas dentales y peridentales)'
  } else if (pos <= 5) {
    neurovascularSupply =
      'Nervios alveolar inferior y mentoniano · Arteria alveolar inferior (ramas dentales) y arteria mentoniana'
  } else {
    neurovascularSupply =
      'Nervios alveolar inferior y lingual · Arteria alveolar inferior (ramas dentales)'
  }

  const coords3D = TOOTH_3D_COORDS[fdi]
  const in3DModel = Boolean(coords3D)
  let missing3DReason: string | undefined
  if (!in3DModel) {
    if (isPrimary) {
      missing3DReason =
        'El modelo 3D anatómico corresponde a una dentición permanente adulta (BodyParts3D 4.3, 28 piezas) y no incluye dentición temporal infantil (51–85).'
    } else if (pos === 8) {
      missing3DReason =
        'El atlas BodyParts3D 4.3 incluye 28 piezas permanentes (11–17, 21–27, 31–37 y 41–47) y no contiene los terceros molares (muelas del juicio 18, 28, 38 y 48).'
    }
  }

  return {
    fdi,
    name,
    labelWithNumber: `${name} · pieza ${fdi}`,
    shortType,
    kind: kind(fdi),
    dentition,
    dentitionLabel: isPrimary ? 'Dentición temporal (infantil)' : 'Dentición permanente',
    quadrant,
    positionFromMidline: pos,
    zoneId,
    zoneLabel,
    archLabel,
    patientSideLabel,
    patientFunction,
    surfacesSummary,
    neurovascularSupply,
    in3DModel,
    missing3DReason,
    coords3D,
  }
}
