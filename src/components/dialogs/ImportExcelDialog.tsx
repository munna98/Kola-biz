import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconFileUpload, IconTrash, IconDownload } from '@tabler/icons-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface ImportExcelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  expectedColumns: string[];
  onImport: (data: any[]) => Promise<void>;
  sampleData?: any[]; // For generating a template
}

export default function ImportExcelDialog({ open, onOpenChange, title, expectedColumns, onImport, sampleData }: ImportExcelDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      parseExcel(selectedFile);
    }
  };

  const parseExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (rawJson.length < 2) {
          toast.error("File is empty or missing data rows");
          return;
        }

        const json: any[] = XLSX.utils.sheet_to_json(worksheet);
        
        const cleanJson = json.map(row => {
          const cleanRow: any = {};
          Object.keys(row).forEach(key => {
            cleanRow[key.trim()] = row[key];
          });
          return cleanRow;
        });

        setParsedData(cleanJson);
      } catch (err) {
        toast.error("Failed to parse Excel file");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setLoading(true);
    try {
      await onImport(parsedData);
      toast.success(`Successfully imported ${parsedData.length} records`);
      handleClose();
    } catch (err: any) {
      toast.error(err.toString() || "Import failed");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onOpenChange(false);
  };

  const downloadTemplate = () => {
    toast.info("Downloading template...");
    const ws = XLSX.utils.json_to_sheet(sampleData || [expectedColumns.reduce((acc, col) => ({ ...acc, [col]: '' }), {})]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `${title}_Template.xlsx`);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { if(!val) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx, .xls) or CSV file. Please ensure your file has the correct column headers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-hidden mt-4">
          {!file && (
            <div className="flex flex-col items-center justify-center gap-6">
              <div 
                className="w-full border-2 border-dashed border-muted rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 transition-colors bg-muted/10"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconFileUpload size={48} className="text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Click to Upload Excel File</h3>
                <p className="text-sm text-muted-foreground mt-2 text-center max-w-sm">
                  Supported formats: .xlsx, .xls, .csv
                </p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept=".xlsx, .xls, .csv" 
                  className="hidden" 
                />
              </div>

              <div className="w-full bg-muted/20 border rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-medium">Need a template?</h4>
                  <p className="text-sm text-muted-foreground mt-1">Download a sample file with the correct columns to get started.</p>
                </div>
                <Button variant="outline" onClick={downloadTemplate}>
                  <IconDownload size={16} className="mr-2" /> Download Template
                </Button>
              </div>
            </div>
          )}

          {file && (
            <>
              <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <IconFileUpload className="text-muted-foreground" size={24} />
                  <div>
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{parsedData.length} valid rows found</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setFile(null); setParsedData([]); }}>
                  <IconTrash size={16} className="text-destructive" />
                </Button>
              </div>

              {parsedData.length > 0 && (
                <div className="flex-1 overflow-auto border rounded-md max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted z-10 shadow-sm">
                      <tr>
                        {expectedColumns.map(col => (
                          <th key={col} className="p-2 text-left font-medium whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 50).map((row, idx) => (
                        <tr key={idx} className="border-t hover:bg-muted/50">
                          {expectedColumns.map(col => (
                            <td key={col} className="p-2 truncate max-w-[150px]">
                              {row[col] !== undefined && row[col] !== null ? String(row[col]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {parsedData.length > 50 && (
                        <tr>
                          <td colSpan={expectedColumns.length} className="p-4 text-center text-muted-foreground border-t bg-muted/10">
                            ... and {parsedData.length - 50} more rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t mt-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleImport} disabled={loading || parsedData.length === 0}>
                  {loading ? 'Importing...' : `Confirm & Import ${parsedData.length} Records`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
