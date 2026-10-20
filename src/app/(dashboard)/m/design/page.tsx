import { DesignOverview } from "@/lib/design-page";
export default function DesignPage() {
  return <DesignOverview slug="design" title="Design Studio" sub="Concepts, mood boards, layouts and 3D renders across all projects" kinds={["concept", "moodboard", "material_board", "layout", "render_3d"]} />;
}
