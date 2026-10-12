"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { emailSignaturesApi } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Eye, Code, Mail, Plus, User, Building2, Bold, Italic, Underline, Link, Image, List, ListOrdered } from "lucide-react";
import { EmailSignature } from "./page";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import UnderlineExtension from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Toggle } from "@/components/ui/toggle";

const emailSignatureFormSchema = z.object({
  name: z.string().min(1, "Signature name is required"),
  content: z.string().min(1, "Signature content is required"),
  plainText: z.string().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

type EmailSignatureFormValues = z.input<typeof emailSignatureFormSchema>;

interface EmailSignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signature?: EmailSignature | null;
  onSuccess?: () => void;
}

const availableVariables = [
  { label: "User Name", value: "{{user.name}}", category: "User" },
  { label: "User Email", value: "{{user.email}}", category: "User" },
  { label: "User Title", value: "{{user.title}}", category: "User" },
  { label: "User Phone", value: "{{user.phone}}", category: "User" },
  { label: "Company Name", value: "{{company.name}}", category: "Company" },
  { label: "Company Email", value: "{{company.email}}", category: "Company" },
  { label: "Company Phone", value: "{{company.phone}}", category: "Company" },
  { label: "Company Address", value: "{{company.address}}", category: "Company" },
  { label: "Company Website", value: "{{company.website}}", category: "Company" },
  { label: "Current Date", value: "{{date.current}}", category: "System" },
  { label: "Current Year", value: "{{date.year}}", category: "System" }
];

export function EmailSignatureDialog({
  open,
  onOpenChange,
  signature,
  onSuccess
}: EmailSignatureDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("compose");
  const [previewMode, setPreviewMode] = React.useState(false);
  const [selectedVariable, setSelectedVariable] = React.useState<string>("");

  const form = useForm<EmailSignatureFormValues>({
    resolver: zodResolver(emailSignatureFormSchema),
    defaultValues: {
      name: "",
      content: "",
      plainText: "",
      isDefault: false,
      isActive: true
    }
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      UnderlineExtension,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-blue-600 underline"
        }
      }),
      ImageExtension.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto"
        }
      }),
      TextStyle,
      Color
    ],
    content: form.watch("content") || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      form.setValue("content", html);
      form.setValue("plainText", text);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] p-4"
      }
    }
  });

  React.useEffect(() => {
    if (open) {
      if (signature) {
        form.reset({
          name: signature.name,
          content: signature.content || "",
          plainText: signature.plainText || "",
          isDefault: signature.isDefault,
          isActive: signature.isActive
        });
        if (editor) {
          editor.commands.setContent(signature.content || "");
        }
      } else {
        form.reset({
          name: "",
          content: "",
          plainText: "",
          isDefault: false,
          isActive: true
        });
        if (editor) {
          editor.commands.setContent("");
        }
      }
      setActiveTab("compose");
      setPreviewMode(false);
    }
  }, [open, signature, form, editor]);

  React.useEffect(() => {
    if (editor && form.watch("content")) {
      const currentContent = editor.getHTML();
      if (currentContent !== form.watch("content")) {
        editor.commands.setContent(form.watch("content") || "");
      }
    }
  }, [form.watch("content"), editor]);

  const insertVariable = (variable: string) => {
    if (editor) {
      editor.chain().focus().insertContent(variable).run();
    }
  };

  const getPreviewContent = () => {
    const content = form.watch("content");
    
    // Replace variables with sample data for preview
    let previewContent = content;
    
    const sampleData: Record<string, string> = {
      "{{user.name}}": "John Doe",
      "{{user.email}}": "john.doe@example.com",
      "{{user.title}}": "Sales Manager",
      "{{user.phone}}": "+1 (555) 123-4567",
      "{{company.name}}": "Your Company",
      "{{company.email}}": "info@yourcompany.com",
      "{{company.phone}}": "+1 (555) 000-0000",
      "{{company.address}}": "123 Business St, City, State 12345",
      "{{company.website}}": "www.yourcompany.com",
      "{{date.current}}": new Date().toLocaleDateString(),
      "{{date.year}}": new Date().getFullYear().toString()
    };

    Object.entries(sampleData).forEach(([key, value]) => {
      previewContent = previewContent.replace(new RegExp(key.replace(/[{}]/g, "\\$&"), "g"), value);
    });

    return previewContent;
  };

  const onSubmit = async (data: EmailSignatureFormValues) => {
    setIsSubmitting(true);
    try {
      const parsed = emailSignatureFormSchema.parse(data);
      if (signature) {
        await emailSignaturesApi.updateEmailSignature(signature.id, parsed);
        toast.success("Email signature updated successfully");
      } else {
        await emailSignaturesApi.createEmailSignature(parsed);
        toast.success("Email signature created successfully");
      }
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save email signature:", error);
      toast.error(error.message || "Failed to save email signature");
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupedVariables = availableVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, typeof availableVariables>);

  if (!editor) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>
            {signature ? "Edit Email Signature" : "Create Email Signature"}
          </DialogTitle>
          <DialogDescription>
            {signature
              ? "Update the email signature configuration below."
              : "Create a new email signature with rich formatting and variables."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-6 overflow-hidden">
              <TabsList className="mb-4">
                <TabsTrigger value="compose">Compose</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
                <TabsTrigger value="variables">Variables</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              
              <TabsContent value="compose" className="flex-1 flex flex-col overflow-hidden space-y-4">
                <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Signature Information</h3>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signature Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Default Signature, Sales Team" {...field} />
                        </FormControl>
                        <FormDescription>
                          A descriptive name to identify this signature
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2 flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between">
                      <FormLabel>Signature Content *</FormLabel>
                      <div className="flex gap-1 border rounded-md p-1">
                        <Toggle
                          pressed={editor.isActive("bold")}
                          onPressedChange={() => editor.chain().focus().toggleBold().run()}
                          size="sm"
                          aria-label="Bold"
                        >
                          <Bold className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                          pressed={editor.isActive("italic")}
                          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
                          size="sm"
                          aria-label="Italic"
                        >
                          <Italic className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                          pressed={editor.isActive("underline")}
                          onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
                          size="sm"
                          aria-label="Underline"
                        >
                          <Underline className="h-4 w-4" />
                        </Toggle>
                        <Separator orientation="vertical" className="h-6" />
                        <Toggle
                          pressed={editor.isActive("bulletList")}
                          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
                          size="sm"
                          aria-label="Bullet List"
                        >
                          <List className="h-4 w-4" />
                        </Toggle>
                        <Toggle
                          pressed={editor.isActive("orderedList")}
                          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
                          size="sm"
                          aria-label="Ordered List"
                        >
                          <ListOrdered className="h-4 w-4" />
                        </Toggle>
                        <Separator orientation="vertical" className="h-6" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const url = window.prompt("Enter URL:");
                            if (url) {
                              editor.chain().focus().setLink({ href: url }).run();
                            }
                          }}
                        >
                          <Link className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const url = window.prompt("Enter image URL:");
                            if (url) {
                              editor.chain().focus().setImage({ src: url }).run();
                            }
                          }}
                        >
                          <Image className="h-4 w-4" />
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedVariable) {
                              insertVariable(selectedVariable);
                            } else {
                              setActiveTab("variables");
                            }
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Variable
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-md flex-1 overflow-hidden flex flex-col">
                      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
                    </div>
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem className="hidden">
                          <FormControl>
                            <Input {...field} type="hidden" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the toolbar to format your signature. Insert variables using the Variable button.
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Email Signature Preview</h3>
                    <p className="text-sm text-muted-foreground">
                      This is how your signature will appear in emails
                    </p>
                  </div>
                  
                  <div className="border rounded-lg p-6 bg-muted/30">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Mail className="h-4 w-4" />
                        <span className="font-medium">Email Preview</span>
                      </div>
                      <div
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: getPreviewContent() }}
                      />
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 bg-muted/30">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        <span className="font-medium">Plain Text Version</span>
                      </div>
                      <FormField
                        control={form.control}
                        name="plainText"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea
                                placeholder="Plain text version of your signature (auto-generated from HTML)"
                                {...field}
                                rows={6}
                                readOnly
                              />
                            </FormControl>
                            <FormDescription>
                              This plain text version is automatically generated. You can edit it if needed.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="variables" className="flex-1 overflow-y-auto">
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Available Variables</h3>
                    <p className="text-sm text-muted-foreground">
                      Click on a variable to insert it into your signature
                    </p>
                  </div>
                  
                  {Object.entries(groupedVariables).map(([category, variables]) => (
                    <div key={category} className="space-y-2">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        {category === "User" && <User className="h-4 w-4" />}
                        {category === "Company" && <Building2 className="h-4 w-4" />}
                        {category === "System" && <Code className="h-4 w-4" />}
                        {category}
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {variables.map((variable) => (
                          <Button
                            key={variable.value}
                            type="button"
                            variant="outline"
                            className="justify-start"
                            onClick={() => {
                              setSelectedVariable(variable.value);
                              insertVariable(variable.value);
                              setActiveTab("compose");
                            }}
                          >
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-medium">{variable.label}</span>
                              <code className="text-xs text-muted-foreground">{variable.value}</code>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="flex-1 overflow-y-auto">
                <div className="space-y-6">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-semibold">Signature Settings</h3>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Set as Default</FormLabel>
                          <FormDescription>
                            This signature will be used by default when sending emails
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Only active signatures can be used in emails
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="px-6 pb-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : signature ? "Update Signature" : "Create Signature"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

