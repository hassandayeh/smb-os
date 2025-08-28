import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function HomePage() {
  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="container max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Theme & Components OK</CardTitle>
            <CardDescription>
              This text uses <code>text-muted-foreground</code>. The card uses <code>bg-card</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p>
              If you can see proper spacing, rounded corners, and subtle borders, the Tailwind mapping to
              CSS variables is working.
            </p>
          </CardContent>
          <CardFooter>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  )
}
