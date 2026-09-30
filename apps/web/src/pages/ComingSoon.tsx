import { Card } from '@/components/ui';
import { PageHeader } from '@/components/PageHeader';

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle="Planned for the next phase" />
      <Card className="p-10 text-center">
        <p className="mx-auto max-w-md text-sm text-slate-500">{description}</p>
      </Card>
    </div>
  );
}
