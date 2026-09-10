// src/constants/collabRoles.js
//
// The collaboration role vocabulary, in one place.
//
// This list lived only inside CollaboratorSearch, which is the component that
// WRITES a role. Everything that reads one back — the Collaborations rail on an
// artist profile above all — had no access to it, so it rendered the raw stored
// value: "featured", "co_producer", "performing_artist". A profile is a public
// page and those are database slugs.
//
// Two callers, one source. If a role is added here it appears in the picker and
// reads correctly on every profile at the same time.

export const COLLAB_ROLES = [
  { value: 'featured',          label: 'Featured Artist'     },
  { value: 'performing_artist', label: 'Performing Artist'   },
  { value: 'producer',          label: 'Producer'            },
  { value: 'co_producer',       label: 'Co-Producer'         },
  { value: 'beatmaker',         label: 'Beatmaker'           },
  { value: 'songwriter',        label: 'Songwriter'          },
  { value: 'lyricist',          label: 'Lyricist'            },
  { value: 'vocalist',          label: 'Vocalist'            },
  { value: 'musician',          label: 'Musician'            },
  { value: 'arranger',          label: 'Arranger'            },
  { value: 'remix',             label: 'Remix'               },
  { value: 'engineer',          label: 'Mixing Engineer'     },
  { value: 'mastering',         label: 'Mastering Engineer'  },
  { value: 'recording',         label: 'Recording Engineer'  },
  { value: 'director',          label: 'A&R / Director'      },
];

const BY_VALUE = COLLAB_ROLES.reduce((m, r) => { m[r.value] = r.label; return m; }, {});

// A role that is not in the list still has to render as something a human wrote,
// because roles have been stored as free text and older rows may hold anything.
// Falls back to title-casing the stored value rather than to a wrong label.
export function collabRoleLabel(value) {
  if (!value) return null;
  return BY_VALUE[value]
    || String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// The short verb used to credit someone ON a track, as opposed to naming their
// role. "feat. Nomsa" is how a feature is written everywhere in music; "prod.
// by X" likewise. Anything not in this map falls through to "Role: Name".
const CREDIT_PREFIX = {
  featured:          'feat.',
  performing_artist: 'with',
  producer:          'prod.',
  co_producer:       'co-prod.',
  beatmaker:         'beat by',
  remix:             'remix by',
};

export function collabCredit(value, name) {
  if (!name) return collabRoleLabel(value);
  const prefix = CREDIT_PREFIX[value];
  return prefix ? `${prefix} ${name}` : `${collabRoleLabel(value)}: ${name}`;
}