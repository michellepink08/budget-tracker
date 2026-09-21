"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {planningLinks,trackerLinks} from "./nav-links";
export function WorkspaceSections(){const pathname=usePathname();const links=planningLinks.some(l=>l.href===pathname)?planningLinks:trackerLinks.some(l=>l.href.split("?")[0]===pathname)?trackerLinks:null;if(!links)return null;return <nav aria-label={links===planningLinks?"Plan sections":"Tracker sections"} className="workspace-tabs mb-6 flex flex-wrap gap-1 border-b">{links.map(link=><Link key={link.href} href={link.href} aria-current={link.href.split("?")[0]===pathname?"page":undefined} className="border-b-2 border-transparent px-4 py-3 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-primary">{link.label}</Link>)}</nav>}
