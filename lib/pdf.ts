"use server";

import PDFParser from "pdf2json";

function forEachItem(pdf: any, handler: any) {
  var Pages = pdf.Pages || pdf.formImage.Pages;
  for (var p in Pages) {
    var page = Pages[p];
    for (var t in page.Texts) {
      var item = page.Texts[t];
      item.text = decodeURIComponent(item.R[0].T);
      handler(item);
    }
  }
}

export const extractTextFromPdf_Pdfjs = async (buf: Buffer) => {
  console.log("extracting text from pdf with pdfjs");
  return await new Promise<string>((resolve, reject) => {
    const rows: string[] = [];
    const pdfParser = new PDFParser();
    pdfParser.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError)
    );
    pdfParser.on("pdfParser_dataReady", (data) => {
      forEachItem(data, (item: any) => {
        if (item?.text) {
          rows.push(item.text);
        }
      });
      resolve(rows.join(" "));
    });
    pdfParser.parseBuffer(buf);
  });
};

export const extractTextFromPdf_Marker = async (
  buf: Buffer
): Promise<string> => {
  console.log("extracting text from pdf with marker");

  const headers = {
    "X-Api-Key": process.env.DATALAB_API_KEY || "",
  };

  const formData = new FormData();

  formData.append(
    "file",
    new Blob([buf], { type: "application/pdf" }),
    "resource.pdf"
  );
  formData.append("langs", "English");
  formData.append("force_ocr", "false");
  formData.append("paginate", "false");
  formData.append("extract_images", "false");

  const response = await fetch("https://www.datalab.to/api/v1/marker", {
    method: "POST",
    body: formData,
    headers,
  });

  const json = await response.json();
  if (response.status !== 200) {
    console.log(json);
    throw new Error(
      json.detail || "Failed to extract text from PDF - bad response"
    );
  }

  const checkUrl = json.request_check_url;
  if (!checkUrl) {
    console.log(json);
    throw new Error("Failed to extract text from PDF - no check url");
  }
  const maxPolls = 300;

  for (let i = 0; i < maxPolls; i++) {
    const response = await fetch(checkUrl, {
      headers,
    });
    const json = await response.json();
    if (response.status !== 200) {
      throw new Error(
        "Failed to extract text from PDF - invalid http response"
      );
    }
    if (json.status === "complete") {
      if (!json.success) {
        throw new Error(
          json.error || "Failed to extract text from PDF - took too long"
        );
      }
      return json.markdown as string;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // :pray: we dont have to setup webhooks for this
  throw new Error("Failed to extract text from PDF - took too long");
};
