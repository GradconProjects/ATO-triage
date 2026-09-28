import type { OccupationTag } from '../engine/types';

export interface Occupation {
  id: string;              // 'disability_support_worker'
  label: string;           // 'Disability support worker'
  aliases: string[];       // 'NDIS support worker', 'carer', 'PCA', 'AIN'
  anzsco?: string;         // optional ANZSCO code for search
  tags: OccupationTag[];
  deepModule?: 'dsw' | 'construction' | 'chef_hospitality';
}

const DSW_TAGS: OccupationTag[] = [
  'all_employees', 'vehicle_travel', 'uniform_ppe', 'licences_cards', 'phone_internet', 'home_office', 'sun_protection', 'self_education',
];
const CONSTRUCTION_TAGS: OccupationTag[] = [
  'all_employees', 'vehicle_travel', 'tools_equipment', 'uniform_ppe', 'licences_cards', 'overnight_travel', 'sun_protection', 'fifo', 'phone_internet',
];
const CHEF_TAGS: OccupationTag[] = [
  'all_employees', 'vehicle_travel', 'tools_equipment', 'uniform_ppe', 'licences_cards', 'self_education',
];
const OFFICE_TAGS: OccupationTag[] = ['all_employees', 'vehicle_travel', 'home_office', 'phone_internet', 'self_education'];

export const OTHER_OCCUPATION_ID = 'other';

export const OCCUPATIONS: Occupation[] = [
  {
    id: 'disability_support_worker',
    label: 'Disability or community support worker',
    aliases: ['NDIS support worker', 'NDIS worker', 'carer', 'personal care assistant', 'PCA', 'AIN', 'assistant in nursing', 'support coordinator', 'community support worker', 'aged care worker', 'home care worker'],
    anzsco: '423111',
    tags: DSW_TAGS,
    deepModule: 'dsw',
  },
  { id: 'construction_labourer', label: 'Construction labourer', aliases: ['labourer', 'construction worker', 'site labourer'], anzsco: '821111', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'carpenter', label: 'Carpenter or joiner', aliases: ['chippy', 'joiner', 'formwork carpenter'], anzsco: '331212', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'concreter', label: 'Concreter', aliases: ['concrete worker', 'concrete finisher'], anzsco: '821211', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'formworker', label: 'Formworker', aliases: ['formwork'], anzsco: '821211', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'steel_fixer', label: 'Steel fixer', aliases: ['reo fixer', 'reinforcement fixer'], anzsco: '821711', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'electrician', label: 'Electrician', aliases: ['sparky', 'electrical apprentice'], anzsco: '341111', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'plumber', label: 'Plumber', aliases: ['plumbing apprentice', 'gasfitter', 'drainer'], anzsco: '334111', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'bricklayer', label: 'Bricklayer', aliases: ['brickie', 'blocklayer'], anzsco: '331111', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'plant_operator', label: 'Plant or machinery operator', aliases: ['excavator operator', 'crane operator', 'forklift operator', 'earthmoving operator'], anzsco: '721214', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'site_supervisor', label: 'Site supervisor or foreman', aliases: ['foreman', 'leading hand', 'site manager'], anzsco: '312112', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'civil_engineer_site', label: 'Civil engineer (site-based)', aliases: ['site engineer', 'civil engineer', 'project engineer on site'], anzsco: '233211', tags: CONSTRUCTION_TAGS, deepModule: 'construction' },
  { id: 'chef', label: 'Chef', aliases: ['head chef', 'sous chef', 'chef de partie', 'apprentice chef'], anzsco: '351311', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'cook', label: 'Cook', aliases: ['line cook', 'short order cook'], anzsco: '351411', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'kitchenhand', label: 'Kitchenhand', aliases: ['kitchen hand', 'dishwasher', 'kitchen assistant'], anzsco: '851311', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'catering_staff', label: 'Catering staff', aliases: ['caterer', 'catering assistant', 'event catering'], anzsco: '431111', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'hospitality_worker', label: 'Hospitality worker', aliases: ['waiter', 'waitress', 'wait staff', 'food and beverage attendant'], anzsco: '431511', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'barista', label: 'Barista', aliases: ['cafe worker', 'coffee maker'], anzsco: '431112', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'bartender', label: 'Bartender', aliases: ['bar attendant', 'bar staff'], anzsco: '431111', tags: CHEF_TAGS, deepModule: 'chef_hospitality' },
  { id: 'office_professional', label: 'Office or professional worker', aliases: ['office worker', 'engineer (office)', 'project manager', 'administrator', 'accountant', 'analyst', 'clerk', 'manager'], tags: OFFICE_TAGS },
  { id: OTHER_OCCUPATION_ID, label: 'Other / not listed', aliases: [], tags: ['all_employees'] },
];

export function findOccupation(id: string): Occupation | undefined {
  return OCCUPATIONS.find((o) => o.id === id);
}

export function searchOccupations(query: string): Occupation[] {
  const q = query.trim().toLowerCase();
  if (!q) return OCCUPATIONS;
  return OCCUPATIONS.filter(
    (o) => o.label.toLowerCase().includes(q) || o.aliases.some((a) => a.toLowerCase().includes(q)) || o.anzsco === q,
  );
}

export function tagsForOccupations(ids: readonly string[]): Set<OccupationTag> {
  const set = new Set<OccupationTag>();
  for (const id of ids) {
    const occ = findOccupation(id);
    if (occ) occ.tags.forEach((t) => set.add(t));
    if (occ?.deepModule === 'dsw') set.add('dsw');
    if (occ?.deepModule === 'construction') set.add('construction');
    if (occ?.deepModule === 'chef_hospitality') set.add('chef_hospitality');
  }
  return set;
}
