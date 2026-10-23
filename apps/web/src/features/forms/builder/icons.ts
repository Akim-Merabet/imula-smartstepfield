import {
  AlignLeftIcon, BellIcon, CalculatorIcon, CalendarClockIcon, CalendarIcon, CameraIcon, CircleDotIcon, CircleHelpIcon, ClockIcon,
  EyeIcon, FileTextIcon, FlagIcon, HandIcon, InfoIcon, KeyIcon, LightbulbIcon, ListChecksIcon, ListIcon, MapPinIcon, PenLineIcon,
  RulerIcon, SquareCheckIcon, TextCursorInputIcon, TextIcon, TimerIcon, TriangleAlertIcon, TypeIcon, UserPenIcon, WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import type { QuestionType } from "../types";

export const TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  short_answer: TextCursorInputIcon, long_answer: AlignLeftIcon, multiple_answers: TextIcon, unique_choice: CircleDotIcon,
  multiple_choices: SquareCheckIcon, single_choice_list: ListIcon, multiple_choice_list: ListChecksIcon, date: CalendarIcon,
  datetime: CalendarClockIcon, duration: TimerIcon, value_unit: RulerIcon, photo: CameraIcon, collaborator: UserPenIcon,
  location: MapPinIcon, formula: CalculatorIcon, file: FileTextIcon, text_editor: TypeIcon,
};

export const QUESTION_ICON_COMPONENTS: Record<string, LucideIcon> = {
  question: CircleHelpIcon, clock: ClockIcon, exclamation_triangle: TriangleAlertIcon, wrench: WrenchIcon, flag: FlagIcon,
  info_circle: InfoIcon, bell: BellIcon, key: KeyIcon, hand_paper: HandIcon, lightbulb: LightbulbIcon, calendar: CalendarIcon, eye: EyeIcon,
};

export { PenLineIcon };
