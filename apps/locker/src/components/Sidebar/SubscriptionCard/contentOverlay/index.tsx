import { IndividualSubscriptionCardContent } from './individual';
import { FamilySubscriptionCardContent } from './family';
import React from 'react';
import { hasNonAdminFamilyMembers } from 'utils/user/family';
import { Overlay, SpaceBetweenFlex } from 'components/Container';
import { UserDetails } from 'interfaces/user';

interface Iprops {
    userDetails: UserDetails;
}

export function SubscriptionCardContentOverlay({ userDetails }: Iprops) {
    return (
        <Overlay>
            <SpaceBetweenFlex
                height={'100%'}
                flexDirection={'column'}
                padding={'20px 16px'}
                boxSizing="border-box">
                {hasNonAdminFamilyMembers(userDetails.familyData) ? (
                    <FamilySubscriptionCardContent userDetails={userDetails} />
                ) : (
                    <IndividualSubscriptionCardContent
                        userDetails={userDetails}
                    />
                )}
            </SpaceBetweenFlex>
        </Overlay>
    );
}
