"use client";
import { useRedditTitles } from "../hooks/useRedditTitles";

export function RedditTitlesFeed() {
    const titles = useRedditTitles();

    return (
        <div className="w-full max-w-xl mx-auto p-2">
            <h3 className="text-lg font-bold mb-2">Latest Reddit Titles</h3>
            <ul className="text-sm bg-black bg-opacity-60 rounded p-2 max-h-72 overflow-y-auto">
                {titles.slice().reverse().slice(0, 30).map((title, i) => (
                    <li key={i} className="mb-1 text-white">{title}</li>
                ))}
            </ul>
        </div>
    );
}
