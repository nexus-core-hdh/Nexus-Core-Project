// Field definitions for different resources
// These define which fields are available for field-level permission control

export interface FieldDefinition {
  name: string;
  label: string;
  type: string;
  description?: string;
}

export const fieldDefinitions: Record<string, FieldDefinition[]> = {
  // Lead fields
  "crm.leads": [
    { name: "title", label: "Title", type: "text" },
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "status", label: "Status", type: "select" },
    { name: "source", label: "Source", type: "select" },
    { name: "budget", label: "Budget", type: "number" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "assignedTo", label: "Assigned To", type: "select" },
    { name: "stage", label: "Stage", type: "select" },
    { name: "priority", label: "Priority", type: "select" },
    { name: "expectedCloseDate", label: "Expected Close Date", type: "date" }
  ],

  // Contact fields
  "crm.contacts": [
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "jobTitle", label: "Job Title", type: "text" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "postalCode", label: "Postal Code", type: "text" },
    { name: "website", label: "Website", type: "url" },
    { name: "notes", label: "Notes", type: "textarea" }
  ],

  // Deal fields
  "crm.deals": [
    { name: "title", label: "Deal Title", type: "text" },
    { name: "amount", label: "Amount", type: "number" },
    { name: "currency", label: "Currency", type: "select" },
    { name: "stage", label: "Stage", type: "select" },
    { name: "probability", label: "Probability (%)", type: "number" },
    { name: "expectedCloseDate", label: "Expected Close Date", type: "date" },
    { name: "contact", label: "Contact", type: "select" },
    { name: "company", label: "Company", type: "select" },
    { name: "assignedTo", label: "Assigned To", type: "select" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "source", label: "Source", type: "select" },
    { name: "type", label: "Deal Type", type: "select" }
  ],

  // Customer fields
  "ecommerce.customers": [
    { name: "name", label: "Customer Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "postalCode", label: "Postal Code", type: "text" }
  ],

  // Product fields
  "ecommerce.products": [
    { name: "name", label: "Product Name", type: "text" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "sku", label: "SKU", type: "text" },
    { name: "barcode", label: "Barcode", type: "text" },
    { name: "price", label: "Price", type: "number" },
    { name: "cost", label: "Cost", type: "number" },
    { name: "quantity", label: "Quantity", type: "number" },
    { name: "category", label: "Category", type: "select" },
    { name: "status", label: "Status", type: "select" },
    { name: "images", label: "Images", type: "file" },
    { name: "variants", label: "Variants", type: "json" }
  ],

  // Project fields
  "projectManagement": [
    { name: "title", label: "Project Title", type: "text" },
    { name: "subtitle", label: "Subtitle", type: "text" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "status", label: "Status", type: "select" },
    { name: "progress", label: "Progress (%)", type: "number" },
    { name: "startDate", label: "Start Date", type: "date" },
    { name: "endDate", label: "End Date", type: "date" },
    { name: "deadline", label: "Deadline", type: "date" },
    { name: "budget", label: "Budget", type: "number" },
    { name: "spent", label: "Spent", type: "number" },
    { name: "clientName", label: "Client Name", type: "text" },
    { name: "managerId", label: "Manager", type: "select" },
    { name: "memberIds", label: "Team Members", type: "multiselect" }
  ],

  // Lead create/edit sections
  "crm.leads.create": [
    { name: "title", label: "Title", type: "text" },
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "status", label: "Status", type: "select" },
    { name: "source", label: "Source", type: "select" },
    { name: "budget", label: "Budget", type: "number" },
    { name: "description", label: "Description", type: "textarea" }
  ],
  "crm.leads.edit": [
    { name: "title", label: "Title", type: "text" },
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "status", label: "Status", type: "select" },
    { name: "source", label: "Source", type: "select" },
    { name: "budget", label: "Budget", type: "number" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "assignedTo", label: "Assigned To", type: "select" },
    { name: "stage", label: "Stage", type: "select" }
  ],

  // Contact create/edit sections
  "crm.contacts.create": [
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "jobTitle", label: "Job Title", type: "text" }
  ],
  "crm.contacts.edit": [
    { name: "firstName", label: "First Name", type: "text" },
    { name: "lastName", label: "Last Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "company", label: "Company", type: "text" },
    { name: "jobTitle", label: "Job Title", type: "text" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" }
  ],

  // Deal create/edit sections
  "crm.deals.create": [
    { name: "title", label: "Deal Title", type: "text" },
    { name: "amount", label: "Amount", type: "number" },
    { name: "currency", label: "Currency", type: "select" },
    { name: "stage", label: "Stage", type: "select" },
    { name: "contact", label: "Contact", type: "select" },
    { name: "expectedCloseDate", label: "Expected Close Date", type: "date" }
  ],
  "crm.deals.edit": [
    { name: "title", label: "Deal Title", type: "text" },
    { name: "amount", label: "Amount", type: "number" },
    { name: "currency", label: "Currency", type: "select" },
    { name: "stage", label: "Stage", type: "select" },
    { name: "probability", label: "Probability (%)", type: "number" },
    { name: "expectedCloseDate", label: "Expected Close Date", type: "date" },
    { name: "contact", label: "Contact", type: "select" },
    { name: "company", label: "Company", type: "select" },
    { name: "assignedTo", label: "Assigned To", type: "select" },
    { name: "description", label: "Description", type: "textarea" }
  ],

  // Customer create/edit sections
  "ecommerce.customers.create": [
    { name: "name", label: "Customer Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "address", label: "Address", type: "textarea" }
  ],
  "ecommerce.customers.edit": [
    { name: "name", label: "Customer Name", type: "text" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "city", label: "City", type: "text" },
    { name: "state", label: "State", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "postalCode", label: "Postal Code", type: "text" }
  ]
};

// Get field definitions for a resource path
export function getFieldDefinitions(resourcePath: string): FieldDefinition[] {
  // Try exact match first
  if (fieldDefinitions[resourcePath]) {
    return fieldDefinitions[resourcePath];
  }

  // Try parent paths (e.g., if looking for "crm.leads.create", try "crm.leads")
  const parts = resourcePath.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('.');
    if (fieldDefinitions[parentPath]) {
      return fieldDefinitions[parentPath];
    }
  }

  return [];
}

// Check if a resource supports field-level permissions
export function supportsFieldPermissions(resourcePath: string): boolean {
  return getFieldDefinitions(resourcePath).length > 0;
}

