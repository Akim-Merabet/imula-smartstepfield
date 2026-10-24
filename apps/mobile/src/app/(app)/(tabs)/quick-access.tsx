import { Empty } from "@/components/kit";
import { t } from "@/i18n/fr";

export default function Placeholder() {
  return <Empty>{t("common.noOpenFlow")}</Empty>;
}
