// ui-entity: TaskCard — view model + pure render for a single task row.
//
// May import only from `lib/shared/`. NEVER from `lib/<feature>/` or any
// other UI layer. View models are denormalised, primitive-typed so that
// this layer stays decoupled from any domain shape change.

export interface TaskCardProps {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export function renderTaskCard(props: TaskCardProps): string {
  const mark = props.completed ? "[x]" : "[ ]";
  return `${mark} ${props.title}`;
}
