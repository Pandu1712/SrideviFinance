import * as XLSX from "xlsx";

/**
 * Exports data to an Excel file.
 * @param data Array of objects to export
 * @param fileName Name of the file (without extension)
 * @param sheetName Name of the sheet inside the workbook
 */
export const exportToExcel = (data: any[], fileName: string, sheetName: string = "Data") => {
  if (!data || data.length === 0) {
    throw new Error("No data available to export");
  }

  // Create Worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Set Column Widths automatically based on content
  const objectKeys = Object.keys(data[0]);
  const wscols = objectKeys.map(key => {
    // Find max length in this column
    const maxLength = data.reduce((max, row) => {
      const val = row[key] ? String(row[key]).length : 0;
      return Math.max(max, val);
    }, key.length);
    return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }; // min 10, max 50
  });
  ws['!cols'] = wscols;

  // Create Workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Download File
  const finalFileName = `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, finalFileName);
};
