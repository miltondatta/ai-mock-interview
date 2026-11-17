import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { discoverTaskLearningResources } from "@/utils/studyPlanner/resourceDiscovery";

const convexClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Finds and verifies learning resources for one Study Planner task (see
// utils/studyPlanner/resourceDiscovery.ts) and stores them on the task via
// convex/StudyPlanner.ts:SaveTaskLearningResources. The Task Details page
// reads them back through its live GetTaskDetails query. This route never
// changes a task's status.
export const maxDuration = 120;

export async function POST(req: NextRequest) {
    const user = await currentUser();
    if (!user) {
        return NextResponse.json({ error: "You must be logged in to find learning resources." }, { status: 401 });
    }
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    const convexUser = await convexClient.query(api.users.GetUserByEmail, { email });
    if (!convexUser) {
        return NextResponse.json({ error: "You must be logged in to find learning resources." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const taskId = body && typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    // Ownership-checked: returns null for a task that isn't this user's.
    const details = await convexClient.query(api.StudyPlanner.GetTaskDetails, {
        userId: convexUser._id,
        taskId,
    });
    if (!details) return NextResponse.json({ error: "This task could not be found." }, { status: 404 });

    const rateLimit = await convexClient.mutation(api.rateLimit.consumeStudyTaskResources, {
        userId: convexUser._id,
    });
    if (!rateLimit.ok) {
        return NextResponse.json(
            { error: "You've reached today's limit for finding learning resources. Please try again later." },
            { status: 429 }
        );
    }

    try {
        const { task, plan, phase } = details;
        const resources = await discoverTaskLearningResources({
            taskTitle: task.title,
            taskDescription: task.description || undefined,
            completionCriteria: task.completionCriteria || undefined,
            phaseTitle: phase?.title,
            objectives: phase?.objectives ?? [],
            planTitle: plan?.title,
            learningGoal: plan?.learningGoal || undefined,
            level: plan?.currentLevel ?? undefined,
        });

        // JSON round-trip drops undefined optional fields before they reach
        // Convex's validator.
        await convexClient.mutation(api.StudyPlanner.SaveTaskLearningResources, {
            userId: convexUser._id,
            taskId: task._id as Id<"studyPlanTasks">,
            learningResources: JSON.parse(JSON.stringify(resources)),
        });

        return NextResponse.json({ ok: true });
    } catch (e) {
        console.error("Study Planner resource discovery failed:", e instanceof Error ? e.message : e);
        return NextResponse.json(
            { error: "Unable to find learning resources right now. Please try again." },
            { status: 502 }
        );
    }
}
