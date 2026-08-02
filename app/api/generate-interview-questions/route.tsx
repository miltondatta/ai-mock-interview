import { NextRequest, NextResponse } from "next/server";
import ImageKit from "imagekit";
import axios from "axios";

// Interview question generation can take a while (AI generation via N8N), match the raised proxy timeout
export const maxDuration = 300;

var imagekit = new ImageKit({
    publicKey : process.env.IMAGEKIT_URL_PUBLIC_KEY as string,
    privateKey : process.env.IMAGEKIT_URL_PRIVATE_KEY as string,
    urlEndpoint : process.env.IMAGEKIT_URL_ENDPOINT as string
});

export async function POST(req:NextRequest) {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    try{

        const uploadPdf = await imagekit.upload({
            file:buffer,
            fileName: Date.now().toString()+".pdf",
            isPublished: true
        });

        //Call N8N workflow
        const result = await axios.post("https://n8n.vistechsolutions.online/webhook/generate-interview-question",{
            resumeUrl: uploadPdf?.url
        }, {
            timeout: 280000 // stay just under the 300s proxy/maxDuration ceiling
        });
        console.log(result.data)

        // N8N returns a raw Gemini candidate object; the JSON-encoded questions live at content.parts[0].text
        const rawContent = result.data?.content?.parts?.[0]?.text;
        const parsedContent = typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;

        // Normalize the "Q.1"/"A.1"-style keys into a plain { question, answer } list
        const questions = (parsedContent?.questions ?? []).map((item: Record<string, string>) => {
            const entries = Object.entries(item);
            const question = entries.find(([key]) => key.toUpperCase().startsWith("Q"))?.[1] ?? "";
            const answer = entries.find(([key]) => key.toUpperCase().startsWith("A"))?.[1] ?? "";
            return { question, answer };
        });

        return NextResponse.json({
            questions,
            resumeUrl: uploadPdf?.url
        });
    }catch(e){
        console.log(e);
        return NextResponse.json({ error: "Failed to generate interview questions" }, { status: 500 });
    }
}