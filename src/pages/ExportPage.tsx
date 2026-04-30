import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

const ExportPage = () => {
  const handleExport = (type: string) => {
    toast.info(`${type} export feature coming soon`);
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Export Data</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:border-accent transition-colors" onClick={() => handleExport("Excel")}>
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <Download className="h-10 w-10 text-accent" />
            <h3 className="font-semibold">Excel Export</h3>
            <p className="text-sm text-muted-foreground text-center">Export all data to Excel format</p>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">Export Excel</Button>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-accent transition-colors" onClick={() => handleExport("PDF")}>
          <CardContent className="flex flex-col items-center gap-3 p-6">
            <Download className="h-10 w-10 text-primary" />
            <h3 className="font-semibold">PDF Print</h3>
            <p className="text-sm text-muted-foreground text-center">Generate PDF reports for printing</p>
            <Button variant="outline">Export PDF</Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ExportPage;
