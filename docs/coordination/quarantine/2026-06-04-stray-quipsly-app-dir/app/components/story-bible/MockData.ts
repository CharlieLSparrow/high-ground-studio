import { StoryEntity, AssistantAction } from './StoryBibleTypes';

const PROJECT_ID = 'mock-project-123';

export const MOCK_ENTITIES: StoryEntity[] = [
  {
    id: 'char_1',
    projectId: PROJECT_ID,
    type: 'CHARACTER',
    name: 'Elara Vance',
    aliases: ['Ellie', 'Commander Vance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'A pragmatic starship commander who prioritizes crew survival over corporate directives. Haunted by a past mission where she lost a squad.',
      age: '34',
      appearance: 'Tall, athletic build. Dark hair kept in a tight braid. Always wears a worn leather jacket over her uniform.',
      goals: 'Secure the artifact before the Syndicate can weaponize it, and protect her crew at all costs.',
      conflicts: 'Internal: guilt over past losses. External: pursued by the Syndicate and betrayed by corporate command.'
    },
    mentions: [
      {
        id: 'mention_1',
        entityId: 'char_1',
        documentId: 'doc_1',
        blockId: 'block_42',
        snippet: 'The airlock hissed open, and Elara Vance stepped through, her boots clicking sharply against the grating.',
        createdAt: new Date().toISOString()
      },
      {
        id: 'mention_2',
        entityId: 'char_1',
        documentId: 'doc_2',
        blockId: 'block_17',
        snippet: 'Ellie stared at the tactical display. "We cannot risk a direct assault," she murmured, eyes tracing the enemy patrol routes.',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'char_2',
    projectId: PROJECT_ID,
    type: 'CHARACTER',
    name: 'Kaelen Thorne',
    aliases: ['Kael', 'The Ghost'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'A rogue operative with a mysterious past. Highly skilled in stealth and cyber-infiltration. Reluctantly teams up with Elara.',
      age: 'Late 20s',
      appearance: 'Slender, pale. Cybernetic enhancements visible on the left side of his neck and jaw.',
      goals: 'Clear his debt with the Syndicate so he can finally disappear.',
      conflicts: 'Internal: trust issues. External: hunted by bounty hunters.'
    },
    mentions: [
      {
        id: 'mention_3',
        entityId: 'char_2',
        documentId: 'doc_1',
        blockId: 'block_99',
        snippet: 'A shadow detached itself from the bulkhead. Kaelen Thorne raised his hands in a placating gesture.',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'char_3',
    projectId: PROJECT_ID,
    type: 'CHARACTER',
    name: 'Dr. Aris Thorne',
    aliases: ['Doc', 'Aris'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'The ship\'s chief medical officer. Cynical but deeply caring. Has a gambling problem that occasionally gets the crew in trouble.',
      age: '45',
      appearance: 'Slightly stooped, graying hair, usually has a datapad in hand and coffee stains on his lab coat.',
      goals: 'Keep everyone alive. Pay off his debts.',
      conflicts: 'Struggles to keep his addiction hidden from the crew.'
    },
    mentions: []
  },
  {
    id: 'set_1',
    projectId: PROJECT_ID,
    type: 'SETTING',
    name: 'The Vagabond',
    aliases: ['Ship', 'Home'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'A modified Corellian freighter serving as the main hub for the crew. Fast, heavily armed, but constantly breaking down.',
      location: 'Outer Rim Territories',
      sensoryDetails: ['Smell of ozone and old coffee', 'Constant low hum of the hyperdrive engine', 'Flickering lights in corridor C']
    },
    mentions: [
      {
        id: 'mention_4',
        entityId: 'set_1',
        documentId: 'doc_1',
        blockId: 'block_12',
        snippet: 'The Vagabond rattled as it broke through the atmosphere, complaining loudly but holding together.',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'set_2',
    projectId: PROJECT_ID,
    type: 'SETTING',
    name: 'Nexus Station',
    aliases: ['The Hub', 'Station Alpha'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'A massive, sprawling space station acting as a neutral trading post. Filled with markets, casinos, and shady dealings.',
      location: 'Orbiting a gas giant in the Neutral Zone',
      sensoryDetails: ['Deafening noise of crowds', 'Neon signs reflecting on wet metal decking', 'Smell of exotic spices and fuel exhaust']
    },
    mentions: []
  },
  {
    id: 'theme_1',
    projectId: PROJECT_ID,
    type: 'THEME_MOTIF',
    name: 'Cost of Loyalty',
    aliases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'Exploring the sacrifices characters must make to protect those they care about, contrasting with the corporate betrayal they face.',
    },
    mentions: []
  },
  {
    id: 'scene_1',
    projectId: PROJECT_ID,
    type: 'SCENE',
    name: 'Chapter 1: The Ambush',
    aliases: ['Opening sequence'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'Elara and her crew are ambushed while trying to retrieve a simple cargo container. Kaelen intervenes.',
      setting: 'Derelict Cargo Freighter',
      povCharacter: 'Elara Vance'
    },
    mentions: []
  },
  {
    id: 'rel_1',
    projectId: PROJECT_ID,
    type: 'RELATIONSHIP',
    name: 'Elara & Kaelen',
    aliases: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attributes: {
      description: 'Begins as deep mistrust. Kaelen\'s methods clash with Elara\'s strict moral code, but they respect each other\'s competence.',
      status: 'Reluctant Allies',
      dynamic: 'Enemies to Lovers (slow burn)'
    },
    mentions: []
  }
];

export const MOCK_ACTIONS: AssistantAction[] = [
  {
    id: 'action_1',
    projectId: PROJECT_ID,
    type: 'PROPOSE_ENTITY',
    status: 'PENDING',
    explanation: 'I noticed a new character named "Voss" introduced in Chapter 3. He appears to be a bounty hunter working for the Syndicate.',
    riskLevel: 'LOW',
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 mins ago
    payload: {
      id: 'char_voss_1',
      projectId: PROJECT_ID,
      type: 'CHARACTER',
      name: 'Voss',
      aliases: ['The Hunter'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attributes: {
        description: 'A relentless bounty hunter employed by the Syndicate. Known for never failing a contract.',
        appearance: 'Towering, heavily armored, face hidden behind a polarized visor.',
        goals: 'Capture Kaelen Thorne and retrieve the artifact.'
      },
      mentions: []
    }
  },
  {
    id: 'action_2',
    projectId: PROJECT_ID,
    type: 'PROPOSE_ENTITY_UPDATE',
    status: 'PENDING',
    explanation: 'Based on the recent dialogue in block_204, Elara mentions she is actually 36 years old, not 34. I suggest updating her age attribute.',
    riskLevel: 'LOW',
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
    payload: {
      id: 'char_1',
      updates: {
        attributes: {
          ...MOCK_ENTITIES[0].attributes,
          age: '36'
        }
      }
    }
  },
  {
    id: 'action_3',
    projectId: PROJECT_ID,
    type: 'PROPOSE_ENTITY',
    status: 'PENDING',
    explanation: 'A new setting, "The Rust Wastes", was extensively described over the last two pages. It seems significant enough to track.',
    riskLevel: 'LOW',
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
    payload: {
      id: 'set_3',
      projectId: PROJECT_ID,
      type: 'SETTING',
      name: 'The Rust Wastes',
      aliases: ['The Scrapyard'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attributes: {
        description: 'A sprawling desert of discarded technology and ancient shipwrecks on the planet Othos.',
        sensoryDetails: ['Biting sand filled with metallic dust', 'Howling wind whistling through hollow hulls', 'Blinding glare from polished scrap']
      },
      mentions: []
    }
  },
  {
    id: 'action_4',
    projectId: PROJECT_ID,
    type: 'PROPOSE_ENTITY_UPDATE',
    status: 'APPROVED',
    explanation: 'I extracted Kaelen\'s alias "The Ghost" from his introduction scene.',
    riskLevel: 'LOW',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    payload: {
      id: 'char_2',
      updates: {
        aliases: ['Kael', 'The Ghost']
      }
    }
  },
  {
    id: 'action_5',
    projectId: PROJECT_ID,
    type: 'PROPOSE_ENTITY',
    status: 'REJECTED',
    explanation: 'I thought "The Syndicate" was a character based on the capitalization, but reviewing context, it is a faction.',
    riskLevel: 'MEDIUM',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    payload: {
      id: 'char_syndicate',
      projectId: PROJECT_ID,
      type: 'CHARACTER',
      name: 'The Syndicate',
      aliases: [],
      attributes: {
        description: 'A secretive collective controlling most of the inner system trade routes.'
      },
      mentions: []
    } as any,
  }
];
