// CSV Export utility
export function exportToCSV(data: any[], columns: Array<{ field: string; label: string; visible: boolean }>, filename: string) {
  // Filter visible columns and get their labels
  const visibleColumns = columns.filter(col => col.visible !== false);
  
  // Create CSV header
  const headers = visibleColumns.map(col => col.label);
  const csvRows = [headers.join(',')];
  
  // Add data rows
  data.forEach(row => {
    const values = visibleColumns.map(col => {
      const value = getNestedValue(row, col.field);
      // Escape commas and quotes in CSV
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  });
  
  // Create blob and download
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// PDF Export utility (using window.print for now, can be enhanced with jsPDF later)
export async function exportToPDF(
  data: any[],
  columns: Array<{ field: string; label: string; visible: boolean }>,
  templateName: string,
  entityType: string
) {
  try {
    // Filter visible columns
    const visibleColumns = columns.filter(col => col.visible !== false);
    
    // Create a temporary table element for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Please allow popups to export PDF');
    }

    const tableHeaders = visibleColumns.map(col => col.label);
    const tableRows = data.map(row => 
      visibleColumns.map(col => {
        const value = getNestedValue(row, col.field);
        return value === null || value === undefined ? '' : String(value);
      })
    );

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${templateName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { margin-bottom: 10px; }
            .meta { color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #4285f4; color: white; }
            tr:nth-child(even) { background-color: #f5f7fa; }
            @media print {
              body { padding: 0; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <h1>${templateName}</h1>
          <div class="meta">
            <p><strong>Entity Type:</strong> ${entityType}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Total Records:</strong> ${data.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                ${tableHeaders.map(header => `<th>${escapeHtml(header)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows.map(row => 
                `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
              ).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      printWindow.print();
      // Optionally close after printing
      // printWindow.close();
    }, 250);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Helper function to get nested object values
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, prop) => {
    return current && current[prop] !== undefined ? current[prop] : null;
  }, obj);
}

