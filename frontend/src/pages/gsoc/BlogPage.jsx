import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./BlogPage.scss";

const BlogPage = () => {
  const posts = [
    {
      id: "welcome",
      title: "Welcome to ExtensionShield",
      date: "February 2026",
      excerpt: "Introducing ExtensionShield: an open-source tool for analyzing Chrome extension security, privacy, and governance risks.",
      category: "Announcement"
    }
  ];

  return (
    <>
      <SEOHead
        title="Chrome Extension Security Blog | How to Audit & Check Extension Safety"
        description="How to check chrome extension permissions safely, detect malicious chrome extensions, and audit a chrome extension before installing. Extension security research and guides."
        pathname="/gsoc/blog"
      />

      <div className="blog-page">
        <div className="blog-content">
          <header className="blog-header">
            <h1>Blog</h1>
            <p>
              Updates, tutorials, and research on browser extension security.
            </p>
          </header>

          <div className="blog-list">
            {posts.map((post) => (
              <article key={post.id} className="blog-card">
                <div className="blog-meta">
                  <span className="category-badge">{post.category}</span>
                  <span className="date">{post.date}</span>
                </div>
                <h2>{post.title}</h2>
                <p>{post.excerpt}</p>
              </article>
            ))}
          </div>

          <div className="blog-empty-cta">
            <h3>Chrome extension security guides</h3>
            <p>
              Read our SEO blog for how to check chrome extension permissions safely, audit a chrome extension before installing, and enterprise browser extension risk management.
            </p>
            <Link to="/blog" className="cta-button">
              Extension security blog →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default BlogPage;

