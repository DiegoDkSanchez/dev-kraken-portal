import PDFDocument from "pdfkit";
export function estimatePDF(estimate, project) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.image(new URL("../assets/logo.png", import.meta.url).pathname, 50, 42, {
      width: 60,
    });
    doc.fillColor("#011F4B").fontSize(25).text("DEV KRAKEN", 125, 50);
    doc.x = 50;
    doc.y = 95;
    doc
      .fontSize(10)
      .fillColor("#62727B")
      .text("CUSTOMER PORTAL  /  PROJECT ESTIMATE");
    doc.moveDown(3);
    doc.fillColor("#011F4B").fontSize(22).text(estimate.title);
    doc.fontSize(11).text(`${project.name} · ${project.client_name}`);
    doc
      .moveDown()
      .text(
        `EST-${String(estimate.number).padStart(4, "0")}  |  ${estimate.status.toUpperCase()}`,
      )
      .text(
        `Prepared ${new Date(estimate.created_at).toISOString().slice(0, 10)}`,
      )
      .text(`For ${estimate.client_email}`);
    doc.moveDown(2);
    let total = 0;
    for (const item of estimate.items) {
      const amount = Math.round(item.quantity * item.rate * 100) / 100;
      total += Math.round(amount * 100);
      doc.fillColor("#011F4B").fontSize(12).text(item.description);
      doc
        .fontSize(10)
        .fillColor("#62727B")
        .text(
          `${item.quantity} × ${estimate.currency} ${item.rate.toFixed(2)}     ${estimate.currency} ${amount.toFixed(2)}`,
        );
      doc.moveDown();
    }
    doc
      .moveDown()
      .fillColor("#011F4B")
      .fontSize(18)
      .text(`Total  ${estimate.currency} ${(total / 100).toFixed(2)}`);
    if (estimate.notes) doc.moveDown().fontSize(10).text(estimate.notes);
    if (estimate.approved_at)
      doc
        .moveDown()
        .text(
          `Approved by ${estimate.approved_by} on ${new Date(estimate.approved_at).toISOString()}`,
        );
    doc.end();
  });
}
