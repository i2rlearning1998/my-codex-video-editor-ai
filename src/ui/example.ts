import {
  createComposition,
  createLayer,
  createProject,
  number,
  validateProject,
  vector2,
  type Layer,
  type Project,
  type Property,
} from '../core';

/** Detached serializable example; it becomes canonical when opened, never a canvas fixture. */
export function createExampleProject(): Project {
  const project = createProject('Form & Motion — Example');
  project.settings.backgroundColor = '#f0eee7';
  project.compositions = [
    createComposition({ name: 'Main composition', width: 1280, height: 720 }),
  ];
  const color = (value: string): Property => ({
    type: 'color',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  const text = (value: string): Property => ({
    type: 'string',
    value,
    animated: false,
    keyframes: [],
    constraints: [],
  });
  const box = (
    id: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    content?: string,
    fontSize = 24,
  ): Layer => {
    const layer = createLayer(
      id,
      content === undefined ? 'shape' : 'text',
      name,
    );
    layer.transform.position = vector2(x, y);
    layer.properties = {
      width: number(width),
      height: number(height),
      fill: color(fill),
    };
    if (content !== undefined) {
      layer.properties.text = text(content);
      layer.properties.fontSize = number(fontSize);
    }
    return layer;
  };
  const cards = createLayer('example-cards', 'group', 'Card arrangement');
  cards.transform.position = vector2(825, 132);
  cards.transform.rotation = number(12);
  cards.transform.opacity = number(0.92);
  const front = createLayer('example-front', 'group', 'Front card');
  front.transform.position = vector2(18, -12);
  front.transform.rotation = number(-8);
  front.children = [
    box('example-paper', 'Lime paper', 0, 0, 260, 350, '#d9e38e'),
    box(
      'example-card-title',
      'Card title',
      28,
      42,
      210,
      150,
      '#242b24',
      'FRAME\nOF MIND',
      38,
    ),
    box('example-rule', 'Card rule', 28, 265, 202, 3, '#394533'),
    box(
      'example-card-note',
      'Card edition',
      28,
      288,
      215,
      40,
      '#394533',
      'A NEW PERSPECTIVE',
      14,
    ),
  ];
  cards.children = [
    box('example-back', 'Lavender paper', -35, 50, 260, 350, '#b4a2d5'),
    front,
  ];
  project.compositions[0]!.layers = [
    box(
      'example-kicker',
      'Studio note',
      76,
      72,
      600,
      40,
      '#5e625c',
      'STUDIO NOTES  /  001',
      20,
    ),
    box(
      'example-headline',
      'Main headline',
      76,
      165,
      730,
      230,
      '#272b29',
      'Make room\nfor your ideas.',
      78,
    ),
    box('example-badge', 'Accent label', 76, 456, 224, 48, '#cbbced'),
    box(
      'example-badge-text',
      'Label text',
      93,
      472,
      208,
      30,
      '#403752',
      'NEW PERSPECTIVES',
      16,
    ),
    box(
      'example-subtitle',
      'Supporting line',
      76,
      570,
      680,
      70,
      '#60645e',
      'A study in shape, space & possibility.',
      24,
    ),
    cards,
    box(
      'example-edition',
      'Edition number',
      1040,
      620,
      180,
      36,
      '#60645e',
      '01  —  04',
      20,
    ),
  ];
  return validateProject(project);
}
