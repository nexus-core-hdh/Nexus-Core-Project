"use client";

import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon } from "lucide-react";

export type ReportElement = {
  id: string;
  type: "label" | "input" | "table" | "image" | "separator" | "text";
  position: { x: number; y: number; width: number; height: number };
  config: any;
  order: number;
};

export default function ReportPreview({
  elements,
  pageSettings,
}: {
  elements: ReportElement[];
  pageSettings: any;
}) {
  return (
    <div
      className="bg-white p-8 shadow-lg border rounded-lg"
      style={{
        width: pageSettings.size === "A4" ? "210mm" : "216mm",
        minHeight: pageSettings.size === "A4" ? "297mm" : "279mm",
        margin: "0 auto",
      }}>
      {elements.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No elements in this report
        </div>
      ) : (
        elements.map((element) => {
          switch (element.type) {
            case "label":
              return (
                <div
                  key={element.id}
                  style={{
                    fontSize: `${element.config.fontSize || 12}px`,
                    fontWeight: element.config.fontWeight || "normal",
                    textAlign: element.config.align || "left",
                    marginBottom: "8px",
                  }}>
                  {element.config.bindingKey ? `{${element.config.bindingKey}}` : element.config.text || "Label"}
                </div>
              );
            case "input":
              return (
                <div key={element.id} className="mb-4">
                  <Label>{element.config.label || "Input"}</Label>
                  <Input
                    placeholder={element.config.placeholder || ""}
                    value={element.config.bindingKey ? `{${element.config.bindingKey}}` : ""}
                    disabled
                    className="mt-1"
                  />
                </div>
              );
            case "text":
              return (
                <div
                  key={element.id}
                  style={{
                    fontSize: `${element.config.fontSize || 11}px`,
                    textAlign: element.config.align || "left",
                    marginBottom: "8px",
                  }}>
                  {element.config.content || "Text content"}
                </div>
              );
            case "separator":
              return <Separator key={element.id} className="my-4" />;
            case "image":
              return (
                <div
                  key={element.id}
                  className="border rounded p-2 flex items-center justify-center mb-4"
                  style={{ height: "100px" }}>
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Image</span>
                </div>
              );
            case "table":
              return (
                <div key={element.id} className="border rounded mb-4 overflow-hidden">
                  <div className="p-2 bg-muted text-sm font-medium">Table</div>
                  <div className="p-3">
                    <div className="text-xs text-muted-foreground mb-2">
                      {element.config.columns?.length || 0} columns, {element.config.rows?.length || 0} rows
                    </div>
                    <div className="overflow-x-auto">
                      <table className={`w-full text-sm ${element.config.borders ?? true ? "border border-border" : ""}`}>
                        {(element.config.header ?? true) && (
                          <thead className="bg-muted/50">
                            <tr>
                              {(element.config.columns || []).map((c: any, idx: number) => (
                                <th
                                  key={`${c?.key ?? idx}`}
                                  className={`px-2 py-1 font-medium ${
                                    element.config.borders ?? true ? "border-b border-border" : ""
                                  }`}
                                  style={{
                                    width: c?.width ? `${c.width}px` : undefined,
                                    textAlign: c?.align || "left",
                                    height: element.config.rowHeight ? `${element.config.rowHeight}px` : undefined,
                                  }}
                                >
                                  {c?.label || `Column ${idx + 1}`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                        )}
                        <tbody>
                          {Array.from({ length: Math.max(1, element.config.rows?.length || 0) }).map((_, rIdx) => (
                            <tr
                              key={rIdx}
                              className={`text-muted-foreground ${
                                element.config.zebra && rIdx % 2 === 1 ? "bg-muted/30" : ""
                              }`}
                              style={{
                                height: element.config.rowHeight ? `${element.config.rowHeight}px` : undefined,
                              }}
                            >
                              {(element.config.columns || []).map((c: any, cIdx: number) => (
                                <td
                                  key={`${c?.key ?? cIdx}-${rIdx}`}
                                  className={`px-2 py-1 ${
                                    element.config.borders ?? true ? "border-t border-border" : ""
                                  }`}
                                  style={{
                                    width: c?.width ? `${c.width}px` : undefined,
                                    textAlign: c?.align || "left",
                                  }}
                                >
                                  {c?.key ? `{${c.key}}` : "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            default:
              return null;
          }
        })
      )}
    </div>
  );
}





