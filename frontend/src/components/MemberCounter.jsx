import React, { useState, useEffect } from "react";
import { supabase } from "../services/supabaseClient";
import "./MemberCounter.scss";

/**
 * MemberCounter - displays total community members and stats
 * Real-time count of users with karma points
 */
function MemberCounter() {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalScans: 0,
    totalKarma: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Get total members (users with karma points)
      const { data: members, error: membersError } = await supabase
        .from("user_profiles")
        .select("user_id", { count: "exact" });

      if (membersError) throw membersError;

      // Get aggregated stats
      const { data: aggData, error: aggError } = await supabase
        .from("user_profiles")
        .select("total_scans, karma_points");

      if (aggError) throw aggError;

      const totalScans = aggData?.reduce((sum, user) => sum + (user.total_scans || 0), 0) || 0;
      const totalKarma = aggData?.reduce((sum, user) => sum + (user.karma_points || 0), 0) || 0;

      setStats({
        totalMembers: members?.length || 0,
        totalScans,
        totalKarma,
      });
    } catch (error) {
      console.error("Error fetching member stats:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="member-counter">
      <div className="stat-card members">
        <div className="stat-value" data-testid="total-members">
          {loading ? "—" : stats.totalMembers}
        </div>
        <div className="stat-label">Members</div>
      </div>

      <div className="stat-card scans">
        <div className="stat-value">
          {loading ? "—" : stats.totalScans.toLocaleString()}
        </div>
        <div className="stat-label">Scans</div>
      </div>

      <div className="stat-card karma">
        <div className="stat-value">
          {loading ? "—" : stats.totalKarma.toLocaleString()}
        </div>
        <div className="stat-label">Karma Points</div>
      </div>
    </div>
  );
}

export default MemberCounter;
